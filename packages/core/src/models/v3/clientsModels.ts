import { prepareRasterScreenshot, ScreenshotValidationError } from '../../utils/boundedRasterScreenshot.js'
import { getRandomDiscordRelay } from '../../utils/tools.js'
import { ConfigDiscord, ConfigServer } from '@gmod/config'
import { EmbedBuilder } from 'discord.js'
import { getSteamUserAvatarLarge } from '@gmod/infra-steam'
import { randomUUID } from 'node:crypto'
import { type Server } from '@gmod/domain-server/Server.js'
import prisma from '@gmod/infra-prisma'
import { type PlayerGmod } from '../../classes/v3/PlayerGmod.js'
import { getTranslate } from '../../utils/localizations.js'
import { createBucketIfNotExists, s3 } from '@gmod/infra-minio'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { enqueueMainClientUploadScreenshot } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { assertPersonalDataAllowed, isErasureBlocked, PersonalDataErasureError } from '@gmod/domain-user/privacy.js'
import {
  GmodBugReportAcknowledgementSchema,
  GmodBugReportAttachmentSchema,
  type GmodBugReportAcknowledgement,
} from '@gmod/schema/gmod/GmodBugReportSchema.js'

type MissingArgumentsResponse<T extends Record<string, unknown>> = {
  error: 'missing_arguments'
  args: {
    [K in keyof T]: boolean
  }
}

function getMissingArguments<T extends Record<string, unknown>>(args: T): MissingArgumentsResponse<T> | null {
  const state = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, value !== undefined]),
  ) as MissingArgumentsResponse<T>['args']

  const hasMissingArguments = Object.values(state).some((isPresent) => !isPresent)
  if (!hasMissingArguments) {
    return null
  }

  return {
    error: 'missing_arguments',
    args: state,
  }
}

export async function saveScreenshot(
  screenshot: string,
  captureData: any,
  player: PlayerGmod,
  server: Server,
  title: string | undefined,
) {
  await assertPersonalDataAllowed(undefined, player.steamID64)
  const format = captureData?.format || 'jpeg'
  if (format !== 'jpeg' && format !== 'png') throw new ScreenshotValidationError('Unsupported screenshot format.')
  const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-')
  const filename = `${dateFormatted}_${player.steamID64}_${randomUUID()}.${format}`

  // Save screenshot to be usable in the website
  const buffer = await prepareRasterScreenshot(screenshot, format)
  // Collection may have been disabled while the raster decoder was running.
  await assertPersonalDataAllowed(undefined, player.steamID64)
  const internUrl = `${ConfigServer.domain}/screenshots/${filename}`
  await createBucketIfNotExists('gmi-players-screenshots')
  await s3.send(
    new PutObjectCommand({
      Bucket: 'gmi-players-screenshots',
      Key: filename,
      Body: buffer,
      ContentType: `image/${format}`,
    }),
  )

  const ensureStillAllowed = async () => {
    if (!(await isErasureBlocked(undefined, player.steamID64))) return
    await s3.send(new DeleteObjectCommand({ Bucket: 'gmi-players-screenshots', Key: filename }))
    await prisma.gm_server_screenshots.deleteMany({ where: { serverID: server.id, url: internUrl } })
    throw new PersonalDataErasureError()
  }
  await ensureStillAllowed()

  let discordUrl = ''
  if (ConfigServer.screenshotChannel) {
    discordUrl = await enqueueMainClientUploadScreenshot({
      channelID: ConfigServer.screenshotChannel,
      content: `Server: ${server.getName()} - Player: ${player.name} - SteamID64: ${player.steamID64}`,
      minioKey: filename,
      fileName: filename,
      contentType: `image/${format}`,
    }).catch(() => '')
  }

  await ensureStillAllowed()
  await prisma.gm_server_screenshots.create({
    data: {
      serverID: server.id,
      title: title,
      player: JSON.stringify(player),
      url: internUrl,
      captureData: JSON.stringify(captureData),
    },
  })
  await ensureStillAllowed()

  return {
    discordUrl,
    internUrl,
    filename,
  }
}

export async function sendScreenshotToDiscord(
  discordUrl: string,
  internUrl: string,
  filename: string,
  player: PlayerGmod,
  server: Server,
  title: string | undefined,
) {
  if (await isErasureBlocked(undefined, player.steamID64))
    return { skip: true, message: 'Personal data collection is disabled' }
  const channelInfo = await server.getScreenshotsChannel()
  if (!channelInfo) {
    return { skip: true, message: 'Channel not found' }
  }
  if (!discordUrl) throw new Error('Discord screenshot upload unavailable')

  const embed = new EmbedBuilder()
    .setImage(discordUrl)
    .setColor(ConfigDiscord.embedColor)
    .setTitle(title || (await getTranslate('discord.screenshot.no_title', 'No title')))
    .setURL(internUrl)
    .setFooter({
      text: `${player.steamID64} - ${server.getName()}`,
    })
    .setTimestamp()

  const webhookRelay = await fetch(getRandomDiscordRelay(), {
    method: 'POST',
    signal: AbortSignal.timeout(12_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ConfigDiscord.barerTokenRelay,
    },
    body: JSON.stringify({
      webhookID: channelInfo.webhook,
      webhookToken: channelInfo.token,
      data: {
        username: player.name,
        avatarURL: await getSteamUserAvatarLarge(player.steamID64),
        embeds: [embed],
      },
    }),
  })
  if (!webhookRelay.ok) throw new Error('Discord screenshot delivery could not be confirmed')

  return { success: true }
}

export async function uploadScreenshotPayload(server: Server, payload: any) {
  const { player, screenshot, captureData, size, title } = payload
  const missingArguments = getMissingArguments({
    player,
    screenshot,
    captureData,
    size,
  })
  if (missingArguments) {
    return missingArguments
  }
  if (await isErasureBlocked(undefined, player.steamID64))
    return { skip: true, message: 'Personal data collection is disabled' }

  try {
    const { discordUrl, filename, internUrl } = await saveScreenshot(screenshot, captureData, player, server, title)
    // The capture is already persisted. A Discord failure must not erase it or replay an uncertain send.
    try {
      const delivery = await sendScreenshotToDiscord(discordUrl, internUrl, filename, player, server, title)
      if ('skip' in delivery) {
        if (delivery.message !== 'Channel not found') return delivery
        return { success: true, saved: true, discordDelivered: false, delivery: 'not_configured' as const }
      }
      return { success: true, saved: true, discordDelivered: true }
    } catch {
      return { success: true, saved: true, discordDelivered: false, delivery: 'unavailable' as const }
    }
  } catch (error) {
    if (error instanceof ScreenshotValidationError) return { error: 'invalid_screenshot' as const }
    throw error
  }
}

export async function reportBugPayload(server: Server, payload: any) {
  const { player, screenshot, description, importance, steps, expected, actual } = payload
  const missingArguments = getMissingArguments({
    player,
    description,
    importance,
    steps,
    expected,
    actual,
  })
  if (missingArguments) {
    return missingArguments
  }
  if (await isErasureBlocked(undefined, player.steamID64))
    return { skip: true, message: 'Personal data collection is disabled' }

  let screenshotName = ''
  const screenshotRequested =
    screenshot !== undefined &&
    !(
      screenshot &&
      typeof screenshot === 'object' &&
      !Array.isArray(screenshot) &&
      Object.keys(screenshot).length === 0
    )
  let attachment: GmodBugReportAcknowledgement['attachment'] = screenshotRequested ? 'failed' : 'none'
  if (screenshotRequested) {
    const parsed = GmodBugReportAttachmentSchema.safeParse(screenshot)
    if (parsed.success) {
      try {
        const screenshotResult = await saveScreenshot(
          parsed.data.screenshot,
          parsed.data.captureData,
          player,
          server,
          '',
        )
        screenshotName = screenshotResult.filename
        attachment = 'saved'
      } catch {
        // The report remains useful without its optional capture. Do not expose storage exceptions.
      }
    }
  }

  await assertPersonalDataAllowed(undefined, player.steamID64)
  const report = await prisma.gm_server_report_bugs.create({
    data: {
      serverID: server.id,
      steamID64: player.steamID64,
      description,
      status: 'open',
      steps,
      expected,
      actual,
      importance,
      screenshot: screenshotName,
    },
  })
  if (await isErasureBlocked(undefined, player.steamID64)) {
    await prisma.gm_server_report_bugs.deleteMany({ where: { id: report.id } })
    return { skip: true, message: 'Personal data collection is disabled' }
  }
  return GmodBugReportAcknowledgementSchema.parse({ success: true, saved: true, attachment })
}
