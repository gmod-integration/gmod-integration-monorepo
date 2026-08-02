import { fileURLToPath } from 'node:url'
import '@gmod/core/utils/update-log.js'
import { gmLog } from '@gmod/core/utils/logger.js'
import { gracefulShutdownMongo } from '@gmod/core/database/gm_server_logs.js'
import { connectPrisma, gracefulShutdownPrisma } from '@gmod/infra-prisma'
import { gracefulShutdownRedis } from '@gmod/infra-redis'
import '@gmod/infra-bullmq'
import { gracefulShutdownDiscord, getGuildClient, loadDiscordMain, loadDiscordSlave } from './discord/index.js'
import { initializeDiscordQueueWorkers } from './discord/workers/discordQueueWorkers.js'
import { setDiscordGuildClientResolver, setDiscordStatusMessageBuilder } from '@gmod/domain-server/discordBridge.js'
import { getStatusMessage } from './discord/utils/messages.js'

let inShutdown = false

export async function gracefulShutdown() {
  if (inShutdown) return
  inShutdown = true
  gmLog('shutdown', 'Gracefully shutting down discord app...')
  await gracefulShutdownDiscord()
  await gracefulShutdownRedis()
  await gracefulShutdownPrisma()
  await gracefulShutdownMongo()
  process.exit(0)
}

export async function main() {
  setDiscordGuildClientResolver(async (guildID: string, forcePresenceOnGuild = true) => {
    return await getGuildClient(guildID, forcePresenceOnGuild)
  })
  setDiscordStatusMessageBuilder(getStatusMessage)

  await connectPrisma()
  await loadDiscordMain()
  await loadDiscordSlave()
  await initializeDiscordQueueWorkers()

  process.on('unhandledRejection', (error: Error) => {
    gmLog('unhandledRejection', error.message, true)
    console.error(error)
  })

  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
