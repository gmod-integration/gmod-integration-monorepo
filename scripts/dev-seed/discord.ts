import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { PrismaClient } from '@gmod/infra-prisma/client.js'
import type { DevSeedData } from './data.js'

const discordId = z.string().regex(/^\d{17,20}$/)
const resourcesSchema = z.object({
  guildId: discordId,
  botId: discordId,
  categoryId: discordId.nullable(),
  channels: z.object({
    status: discordId.nullable(),
    verification: discordId.nullable(),
    logs: discordId.nullable(),
    screenshots: discordId.nullable(),
    votes: discordId.nullable(),
    chat: discordId.nullable(),
  }),
  roles: z.object({
    member: discordId.nullable(),
    verified: discordId.nullable(),
    vip: discordId.nullable(),
    citizen: discordId.nullable(),
  }),
  created: z.object({ channels: z.number(), roles: z.number() }),
  messageIds: z.record(z.array(discordId)),
  webhookIds: z.array(discordId),
  webhooks: z.array(z.object({ id: discordId, channelId: discordId.nullable() })),
})

type Resources = z.infer<typeof resourcesSchema>
type MessageRef = { channel: string; message: string }

export function assertDiscordSeedGuild(guildId: string, configuredGuildId: string) {
  if (guildId !== configuredGuildId) {
    throw new Error('--discord only targets DISCORD_GUILD_ID. Use the dedicated development bot and guild.')
  }
}

async function provisionResources(guildId: string, dryRun: boolean, messages: MessageRef[] = []) {
  const script = fileURLToPath(new URL('../../apps/discord/scripts/provision-dev.ts', import.meta.url))
  const args = [script, '--guild-id', guildId]
  if (dryRun) args.push('--dry-run')
  for (const { channel, message } of messages) args.push('--message', `${channel}/${message}`)
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve(stdout)
      else
        reject(new Error(`Discord development provisioning failed (exit ${code}). Re-run after correcting the error.`))
    })
  })
  const resources = resourcesSchema.parse(JSON.parse(output))
  if (resources.guildId !== guildId) throw new Error('Discord provisioner returned another guild.')
  return resources
}

export async function previewDevelopmentDiscord(guildId: string) {
  const resources = await provisionResources(guildId, true)
  console.log('Discord plan: [DEMO] category, 6 text channels, 4 roles without additional permissions.')
  console.log(
    'Integrations: 3 status messages, auto role, verification, VIP/team roles, logs, chat, screenshots and votes.',
  )
  console.log(
    `Missing Discord resources: ${Object.values(resources.channels).filter((id) => !id).length} text channels, ${Object.values(resources.roles).filter((id) => !id).length} roles.`,
  )
}

/** Existing destinations belong to the developer; never replace a different configuration. */
export function integrationNeedsCreation(
  existing: { channel: string; externalId: string } | null,
  channel: string,
  externalIds: string[],
) {
  if (!existing) return true
  if (existing.channel !== channel)
    throw new Error('An integration already uses a different channel; its configuration was preserved.')
  return !externalIds.includes(existing.externalId)
}

async function configureRolesAndSettings(prisma: PrismaClient, data: DevSeedData, resources: Resources) {
  const guildId = resources.guildId
  const roles = resources.roles
  if (!roles.member || !roles.verified || !roles.vip || !roles.citizen) throw new Error('Discord roles are missing.')
  await prisma.$transaction(async (tx) => {
    const autoRole = await tx.gm_guild_auto_roles.findUnique({ where: { roleID: roles.member! } })
    if (autoRole && autoRole.guildID !== guildId)
      throw new Error('The demo auto role is registered to a different guild.')
    await tx.gm_guild_auto_roles.upsert({
      where: { roleID: roles.member! },
      create: { guildID: guildId, roleID: roles.member! },
      update: {},
    })
    const verified = await tx.gm_guild_verify_role.findFirst({ where: { guildID: guildId, roleID: roles.verified! } })
    const verification = { guildID: guildId, roleID: roles.verified!, enabled: true, isGiveRole: true }
    if (verified) await tx.gm_guild_verify_role.update({ where: { id: verified.id }, data: verification })
    else await tx.gm_guild_verify_role.create({ data: verification })

    for (const serverID of data.discordServerIds) {
      await tx.gm_server_sync_roles.upsert({
        where: { serverID_roleID: { serverID, roleID: roles.vip! } },
        create: { serverID, roleID: roles.vip!, userGroup: 'vip', enable: true },
        update: { userGroup: 'vip', enable: true },
      })
      for (const [setting, value] of Object.entries({
        show_player_list_status: 'true',
        status_player_list_format: '{connectTime} - {name}',
        syncChatDirection: 'both',
        sync_chat_prevent_ping: 'true',
      })) {
        await tx.gm_server_settings.upsert({
          where: { serverID_setting: { serverID, setting } },
          create: { serverID, setting, value },
          update: { value },
        })
      }
      const button = await tx.gm_status_button.findFirst({ where: { server: serverID, name: '[DEMO] Documentation' } })
      const buttonData = {
        server: serverID,
        name: '[DEMO] Documentation',
        url: 'https://docs.gmod-integration.com/',
        emoji: '📘',
        enable: true,
      }
      if (button) await tx.gm_status_button.update({ where: { id: button.id }, data: buttonData })
      else await tx.gm_status_button.create({ data: buttonData })
    }
    const team = { serverID: data.discordServerIds[0], roleID: roles.citizen!, teamName: 'Citoyen', enable: true }
    const existingTeam = await tx.gm_server_sync_team_roles.findFirst({
      where: { serverID: team.serverID, roleID: team.roleID, teamName: team.teamName },
    })
    if (existingTeam) await tx.gm_server_sync_team_roles.update({ where: { id: existingTeam.id }, data: team })
    else await tx.gm_server_sync_team_roles.create({ data: team })
  })
}

export async function configureDevelopmentDiscord(
  prisma: PrismaClient,
  data: DevSeedData,
  writeData: () => Promise<void>,
) {
  const guildId = data.servers[0].guild
  const adapters = await import('@gmod/infra-bullmq/discordQueueAdapters.js')
  const { default: redis } = await import('@gmod/infra-redis')
  const queues = [
    adapters.discordUpdatePseudoQueue,
    adapters.discordUpdateGroupQueue,
    adapters.discordUpdateTeamRoleQueue,
    adapters.discordMainClientOpsQueue,
    adapters.discordGuildOpsQueue,
    adapters.discordStatusRefreshQueue,
  ]
  try {
    if (!(await adapters.enqueueMainClientHasGuild(guildId, 15000)))
      throw new Error('The development Discord worker must be running and present in the guild.')
    const statuses = await prisma.gm_status.findMany({ where: { server: { in: data.discordServerIds } } })
    const verification = await prisma.gm_guild_verify_msg.findUnique({ where: { guildID: guildId } })
    const messages = statuses.map((status) => ({ channel: status.channel, message: status.message }))
    if (verification) messages.push({ channel: verification.channelID, message: verification.messageID })
    // Read-only preflight catches Discord permission/name conflicts before database writes.
    const plan = await provisionResources(guildId, true, messages)
    const bot = await adapters.enqueueDiscordGuildBotClientInfo(guildId, 15000)
    if (!bot || bot.id !== plan.botId)
      throw new Error('Use the development main bot for this guild before creating demo integrations.')
    await writeData()
    const resources = await provisionResources(guildId, false, messages)
    if (Object.values(resources.channels).some((id) => !id)) throw new Error('Discord channels are missing.')
    const channels = resources.channels as Record<keyof Resources['channels'], string>
    const snapshot = await adapters.enqueueDiscordGuildSnapshot(guildId, 20000)
    if (!snapshot || !Object.values(channels).every((id) => snapshot.channels.some((channel) => channel.id === id))) {
      throw new Error('Discord worker has not loaded the demonstration channels. Re-run the command.')
    }
    await configureRolesAndSettings(prisma, data, resources)
    for (const serverID of data.discordServerIds) {
      await redis.del(
        ...['show_player_list_status', 'status_player_list_format', 'syncChatDirection', 'sync_chat_prevent_ping'].map(
          (setting) => `server:${serverID}:setting:${setting}`,
        ),
      )
      let status: { channel: string; message: string } | null = await prisma.gm_status.findUnique({
        where: { server: serverID },
      })
      if (
        !integrationNeedsCreation(
          status && { channel: status.channel, externalId: status.message },
          channels.status,
          resources.messageIds[channels.status] || [],
        )
      ) {
        await adapters.enqueueDiscordServerStatusRefresh(serverID, 30000)
        status = await prisma.gm_status.findUnique({ where: { server: serverID } })
      } else {
        status = await adapters.enqueueDiscordServerStatusCreate(serverID, channels.status, 30000)
      }
      if (!status) throw new Error(`Status creation or refresh failed for ${serverID}.`)
      console.log(`Discord status: https://discord.com/channels/${guildId}/${status.channel}/${status.message}`)

      const integrations = [
        {
          row: await prisma.gm_server_logs_channel.findUnique({ where: { serverID } }),
          channel: channels.logs,
          create: adapters.enqueueDiscordServerLogsChannelCreate,
        },
        {
          row: await prisma.gm_server_vote_channels.findUnique({ where: { serverID } }),
          channel: channels.votes,
          create: adapters.enqueueDiscordServerVoteChannelCreate,
        },
        {
          row: await prisma.gm_server_screenshot_channels.findUnique({
            where: { server_adminCmd: { server: serverID, adminCmd: false } },
          }),
          channel: channels.screenshots,
          create: adapters.enqueueDiscordServerScreenshotChannelCreate,
        },
        {
          row: await prisma.gm_sync_chat.findUnique({ where: { guild_server: { guild: guildId, server: serverID } } }),
          channel: channels.chat,
          create: adapters.enqueueDiscordServerSyncChatCreate,
        },
      ]
      for (const { row, channel, create } of integrations) {
        const existing = row && {
          channel: 'channelID' in row ? row.channelID : row.channel,
          externalId: 'webhookID' in row ? row.webhookID : 'webhook' in row ? row.webhook : row.id,
        }
        if (
          integrationNeedsCreation(
            existing,
            channel,
            resources.webhooks.filter((webhook) => webhook.channelId === channel).map((webhook) => webhook.id),
          )
        ) {
          if (!(await create(serverID, channel, 30000)))
            throw new Error(`Discord webhook configuration failed for ${serverID}.`)
        }
      }
      await prisma.gm_server_logs_triggers.updateMany({
        where: { serverID, channelID: '', message: { startsWith: '[DEMO]' } },
        data: { channelID: channels.logs },
      })
      await redis.del(
        `server:${serverID}:logsTrigger`,
        ...data.logTriggers
          .filter((trigger) => trigger.serverID === serverID)
          .map((trigger) => `server:${serverID}:logsTrigger:${trigger.log_type}`),
      )
    }
    if (verification && verification.channelID !== channels.verification) {
      console.log('The existing guild verification message was preserved in its current channel.')
    } else if (
      integrationNeedsCreation(
        verification && { channel: verification.channelID, externalId: verification.messageID },
        channels.verification,
        resources.messageIds[channels.verification] || [],
      )
    ) {
      if (!(await adapters.enqueueDiscordCreateVerificationMessage(guildId, channels.verification, 30000)))
        throw new Error('Discord verification message creation failed.')
    }
    console.log(
      `Discord development configuration is ready: https://discord.com/channels/${guildId}/${channels.status}`,
    )
  } finally {
    await Promise.allSettled(queues.map((queue) => queue.close()))
  }
}
