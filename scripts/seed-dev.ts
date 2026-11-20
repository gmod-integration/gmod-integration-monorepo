import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDevSeedData, type DevSeedData } from './dev-seed/data.js'
import { assertDevSeedTarget, parseDevSeedOptions, selectSeedOwner } from './dev-seed/options.js'
import { writeDevSeed } from './dev-seed/write.js'
import { assertDiscordSeedGuild, configureDevelopmentDiscord, previewDevelopmentDiscord } from './dev-seed/discord.js'

const help = `Create development fixtures in the local MariaDB and MongoDB databases.

Usage: bun run seed:dev [--guild-id <id>] [--owner-id <id>] [--dry-run] [--discord]

  --guild-id   Existing bot-managed Discord guild (default: DISCORD_GUILD_ID).
  --owner-id   Existing user for demo notifications (default: sole signed-in user).
  --dry-run    Preview fixture counts without writing records.
  --discord    Create real demo channels, roles, status messages and integrations on DISCORD_GUILD_ID.
  --help       Show this help.

Requires DEV=true, local databases, and an existing Discord login.
The command refreshes its demo records and preserves other application data.`

function summarize(data: DevSeedData) {
  return {
    servers: data.servers.length,
    publicServers: data.servers.filter((server) => server.isPublic).length,
    players: data.steamUsers.length,
    playerStats: data.playerStats.length,
    sessions: data.sessions.length,
    statusHistory: data.statusHistory.length,
    warns: data.warns.length,
    bans: data.bans.length,
    votes: data.votes.length,
    bugReports: data.bugReports.length,
    logs: data.mongoLogs.length,
    errors: data.mongoErrors.length,
    links: data.links.length,
    notifications: data.notifications.length,
    screenshots: data.screenshots.length,
    pseudoRules: data.pseudos.length,
    chatFilters: data.chatFilters.length,
    logTriggers: data.logTriggers.length,
  }
}

export async function seedDevelopment(args = process.argv.slice(2)) {
  const options = parseDevSeedOptions(args)
  if (options.help) {
    console.log(help)
    return
  }

  const { ConfigServer, ConfigDiscord } = await import('@gmod/config')
  const { getMariaDbConfig, getMongoConfig } = await import('@gmod/config/infrastructure.js')
  const maria = getMariaDbConfig()
  assertDevSeedTarget({ dev: ConfigServer.dev, mariaHost: maria.host, mongoUri: getMongoConfig().uri })

  // Infrastructure clients are only loaded after the development target has been checked.
  const { default: prisma, gracefulShutdownPrisma } = await import('@gmod/infra-prisma')
  let closeMongo: (() => Promise<void>) | undefined
  let closeRedis: (() => Promise<void>) | undefined
  try {
    const guildId = options.guildId || ConfigDiscord.guildID
    if (options.discord) assertDiscordSeedGuild(guildId, ConfigDiscord.guildID)
    const guild = await prisma.gm_guild.findUnique({ where: { guild: guildId }, select: { guild: true, name: true } })
    if (!guild) throw new Error('The guild is not registered locally. Invite the dev bot, then pass --guild-id.')

    const sessions = options.ownerDiscordId
      ? []
      : await prisma.gm_panelToken.findMany({
          where: { revoke: false, expirationDate: { gt: new Date() } },
          select: { discordID: true },
          distinct: ['discordID'],
        })
    const ownerDiscordId = selectSeedOwner(
      options.ownerDiscordId,
      sessions.map((session) => session.discordID),
    )
    const owner = await prisma.gm_user.findUnique({ where: { id: ownerDiscordId }, select: { id: true } })
    if (!owner) throw new Error('The owner has no local user account. Sign in through Discord before seeding.')

    const data = buildDevSeedData({ guildId, ownerDiscordId, now: new Date(), assetBaseUrl: ConfigServer.websiteUrl })
    console.log(`Development database: ${maria.host}/${maria.database}`)
    console.log(`Community: ${guild.name || guild.guild} (${guild.guild})`)
    console.log(`Notification owner: ${ownerDiscordId}`)
    console.log(JSON.stringify(summarize(data), null, 2))
    if (options.dryRun) {
      if (options.discord) await previewDevelopmentDiscord(guildId)
      console.log('Dry run complete; no records were written.')
      return
    }

    const { mongoClient } = await import('@gmod/infra-mongo')
    closeMongo = () => mongoClient.close()
    const { default: redis, gracefulShutdownRedis } = await import('@gmod/infra-redis')
    closeRedis = gracefulShutdownRedis
    const writeData = async () => {
      await writeDevSeed(prisma, mongoClient, data)
      const keys = ['stats']
      for (const serverID of data.serverIds) {
        keys.push(`server:${serverID}:gmodToDiscordFilter`, `server:${serverID}:logsTrigger`)
      }
      for (const row of data.settings) keys.push(`server:${row.serverID}:setting:${row.setting}`)
      for (const row of data.logTriggers) keys.push(`server:${row.serverID}:logsTrigger:${row.log_type}`)
      for (let offset = 0; offset < keys.length; offset += 250) await redis.del(...keys.slice(offset, offset + 250))
    }
    if (options.discord) await configureDevelopmentDiscord(prisma, data, writeData)
    else await writeData()
    console.log('Development fixtures are ready. Refresh the dashboard and select your development community.')
    for (const server of data.servers.filter((server) => data.discordServerIds.includes(server.id)))
      console.log(`  ${server.name}: ${server.id}`)
    console.log(`  Public ranking: ${data.servers.filter((server) => server.isPublic).length} sample servers.`)
  } finally {
    await Promise.allSettled([gracefulShutdownPrisma(), closeMongo?.(), closeRedis?.()])
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await seedDevelopment()
  } catch (error) {
    console.error(`Development seed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
