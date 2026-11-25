import fs from 'fs'
import { ConfigServer } from '@gmod/config'
import archiver from 'archiver'
import { gmLog } from '@gmod/shared/logger.js'
import { type User } from '@gmod/domain-user/User.js'
import { addNotification } from '@gmod/core/utils/tools.js'
import { getLogsBySteamIDList, getLogsCountBySteamIDList } from '@gmod/core/database/gm_server_logs.js'
import path from 'path'
import * as os from 'node:os'
import { createBucketIfNotExists, s3 } from '@gmod/infra-minio'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import prisma from '@gmod/infra-prisma'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { mongoClient } from '@gmod/infra-mongo'
import { getErrorsBySteamID, getErrorsCountBySteamID } from '@gmod/domain-gmod/GmodErrors.js'
import { assertPersonalDataAllowed, isErasureBlocked, PersonalDataErasureError } from '@gmod/domain-user/privacy.js'

export async function getUserDataGRPD(user: User) {
  const discordID = user.getDiscordID()
  const steamID64 = user.getSteamID64()
  await assertPersonalDataAllowed(discordID, steamID64)

  const request = await prisma.gm_users_data_request.create({
    data: {
      discordID,
      status: 'pending',
      expirationDate: new Date(new Date().setDate(new Date().getDate() + 4)),
      code: Math.random().toString(36).substring(2, 18),
    },
  })

  const baseTempPath = path.join(os.tmpdir(), 'gmod-integration', 'gdpr')
  const tempPath = path.join(baseTempPath, request.id)
  fs.mkdirSync(tempPath, { recursive: true })

  const rewardCursor = mongoClient
    .db('gmod_integration')
    .collection('gm_reward_grants')
    .find(
      {
        $or: [{ discordID }, ...(steamID64 ? [{ steamID64 }] : [])],
      },
      {
        projection: {
          _id: 0,
          deliveryToken: 0,
          dedupeKey: 0,
          onceSteamKey: 0,
          onceDiscordKey: 0,
          requestID: 0,
          requestRevision: 0,
          sweptAt: 0,
          version: 0,
          'actions.code': 0,
        },
      },
    )
    .batchSize(250)
  async function* rewardRecords() {
    let first = true
    yield '['
    try {
      for await (const reward of rewardCursor) {
        yield `${first ? '' : ','}${JSON.stringify(reward)}`
        first = false
      }
      yield ']'
    } finally {
      await rewardCursor.close()
    }
  }
  await pipeline(Readable.from(rewardRecords()), fs.createWriteStream(path.join(tempPath, 'rewards.json')))

  if (discordID) {
    const userData: any = {
      discordUser:
        (await prisma.gm_user.findUnique({
          where: { id: discordID },
          include: {
            gm_users_data_request: { where: { discordID } },
            gm_users_notifications: { where: { discordID } },
          },
        })) || {},
      vote: (await prisma.gm_server_vote.findMany({ where: { userID: discordID } })) || {},
      ban: (await prisma.banUsers.findMany({ where: { discordID } })) || {},
      accountTransfers: await prisma.gm_users_transfers.findMany({
        where: {
          OR: [{ oldDiscordID: discordID }, { newDiscordID: discordID }],
        },
      }),
    }

    fs.writeFileSync(`${tempPath}/discord.json`, JSON.stringify(userData))
  }

  if (steamID64) {
    const userData: any = {
      steamUser:
        (await prisma.gm_user_steam.findUnique({
          where: { steam_id: steamID64 },
          include: {
            gm_server_stat: { where: { steam_id: steamID64 } },
            gm_server_stat_session: { where: { steamID64 } },
          },
        })) || {},
      userWarn: await prisma.gm_server_warn.findMany({
        where: {
          OR: [{ userSteamID64: steamID64 }, { adminSteamID64: steamID64 }],
        },
      }),
      user: await prisma.users.findMany({ where: { steamID64 } }),
      gmodStore: await prisma.gm_gmodstore_purchases.findMany({ where: { steamID64 } }),
      ban: await prisma.banUsers.findMany({ where: { steamID64 } }),
      screenshots: await prisma.gm_server_screenshots.findMany({
        where: {
          url: {
            contains: steamID64,
          },
        },
      }),
      warns: await prisma.gm_server_warn.findMany({
        where: {
          OR: [{ userSteamID64: steamID64 }, { adminSteamID64: steamID64 }],
        },
      }),
      accountTransfers: await prisma.gm_users_transfers.findMany({
        where: {
          OR: [{ oldSteamID64: steamID64 }, { newSteamID64: steamID64 }],
        },
      }),
      reportBugs: await prisma.gm_server_report_bugs.findMany({
        where: {
          steamID64,
        },
      }),
    }

    fs.writeFileSync(`${tempPath}/steam.json`, JSON.stringify(userData))

    //  Server logs
    try {
      const serverLogCount = await getLogsCountBySteamIDList([steamID64])
      const limit = 1000
      let offset = 0
      let fileIndex = 1
      const totalFiles = Math.ceil(serverLogCount / limit)

      while (offset < serverLogCount) {
        const logs = await getLogsBySteamIDList([steamID64], { limit, offset })
        const stream = fs.createWriteStream(`${tempPath}/steam-logs-${fileIndex}-${totalFiles}.json`)

        stream.write('[')
        for (let i = 0; i < logs.length; i++) {
          if (i !== 0) stream.write(',')
          stream.write(JSON.stringify(logs[i]))
        }
        stream.write(']')
        stream.end()

        await new Promise<void>((resolve) => stream.on('finish', () => resolve()))

        offset += limit
        fileIndex++
      }
    } catch (error) {
      console.error('Error fetching server logs:', error)
    }

    //  Error logs
    try {
      const serverErrorsCount = await getErrorsCountBySteamID(steamID64)
      const limit = 1000
      let offset = 0
      let fileIndex = 1
      const totalFiles = Math.ceil(serverErrorsCount / limit)
      while (offset < serverErrorsCount) {
        const errors = await getErrorsBySteamID(steamID64, { limit, offset })
        const stream = fs.createWriteStream(`${tempPath}/steam-errors-${fileIndex}-${totalFiles}.json`)

        stream.write('[')
        for (let i = 0; i < errors.errors.length; i++) {
          if (i !== 0) stream.write(',')
          stream.write(JSON.stringify(errors.errors[i]))
        }
        stream.write(']')
        stream.end()
        await new Promise<void>((resolve) => stream.on('finish', () => resolve()))
        offset += limit
        fileIndex++
      }
    } catch (error) {
      console.error('Error fetching server logs:', error)
    }

    // Screenshots
    const screenshotsPath = path.join(tempPath, 'screenshots')
    fs.mkdirSync(screenshotsPath, { recursive: true })

    // do a LIKE in the url: https://api-dev.gmod-integration.com/screenshots/2025-05-25_23-14-03_76561198219049673_1cd2d7dd-1ef3-434e-bb92-ff57984dc0ef.jpeg
    const plyScreens = await prisma.gm_server_screenshots.findMany({
      where: {
        url: {
          contains: steamID64,
        },
      },
    })

    for (const screen of plyScreens) {
      const fileName = path.basename(screen.url)

      const command = new GetObjectCommand({
        Bucket: 'gmi-players-screenshots',
        Key: fileName,
      })
      const response = await s3.send(command)
      if (response.Body instanceof Readable) {
        const fileStream = fs.createWriteStream(path.join(screenshotsPath, fileName))
        response.Body.pipe(fileStream)
        await new Promise<void>((resolve) => fileStream.on('finish', () => resolve()))
      } else {
        console.error(`Error: no stream returned for screenshot ${fileName}`)
      }
    }
  }

  const zipFilePath = path.join(baseTempPath, `${request.id}.zip`)
  const guardExport = async () => {
    if (!(await isErasureBlocked(discordID, steamID64))) return
    await s3.send(new DeleteObjectCommand({ Bucket: 'gmi-gdpr-exports', Key: `${request.id}.zip` }))
    fs.rmSync(tempPath, { recursive: true, force: true })
    fs.rmSync(zipFilePath, { force: true })
    throw new PersonalDataErasureError()
  }
  const output = fs.createWriteStream(zipFilePath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  // archive.finalize() resolves once entries are queued/flushed to the archive stream, but not
  // necessarily once `output` has actually finished writing to disk (a real race: without this,
  // the immediately-following fs.createReadStream(zipFilePath) can hit ENOENT/a truncated file).
  // Wait for the destination stream's own 'close' event before reading it back.
  const outputClosed = new Promise<void>((resolve) => {
    output.on('close', () => {
      gmLog('rgpd', `Data for user ${discordID} zipped to ${zipFilePath} (${archive.pointer()} bytes)`)
      resolve()
    })
  })

  archive.on('error', (err) => {
    throw err
  })
  archive.pipe(output)

  function addFilesRecursively(dir: string, archive: archiver.Archiver, baseDir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const archivePath = path.relative(baseDir, fullPath)
      if (entry.isDirectory()) {
        addFilesRecursively(fullPath, archive, baseDir)
        console.log(`Adding directory to archive: ${archivePath}`)
      } else {
        archive.file(fullPath, { name: archivePath })
        console.log(`Adding file to archive: ${archivePath}`)
      }
    }
  }

  addFilesRecursively(tempPath, archive, tempPath)

  await archive.finalize()
  await outputClosed

  await guardExport()

  await createBucketIfNotExists('gmi-gdpr-exports')
  const zipStream = fs.createReadStream(zipFilePath)

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: 'gmi-gdpr-exports',
        Key: `${request.id}.zip`,
        Body: zipStream,
        ContentType: 'application/zip',
      }),
    )
  } catch (err) {
    console.error('Error uploading zip to MinIO:', err)
  }

  await guardExport()

  fs.rmSync(tempPath, { recursive: true, force: true })
  fs.rmSync(zipFilePath, { force: true })

  request.downloadLink = `${ConfigServer.domain}/gdpr-request/${request.id}`
  request.status = 'ready'

  await prisma.gm_users_data_request.update({
    where: { id: request.id },
    data: {
      downloadLink: request.downloadLink,
      status: request.status,
    },
  })

  if (discordID) {
    await addNotification(discordID, 'gdpr', `Your GDPR request is ready: ${ConfigServer.websiteUrl}/account`)
  }

  return request
}
