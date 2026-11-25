import type { Prisma, PrismaClient } from '@gmod/infra-prisma/client.js'
import { ObjectId, type MongoClient } from 'mongodb'
import type { DevSeedData } from './data.js'

const MONGO_SEED_MARKER = 'gmod-development-seed-v1'

async function insertBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await insert(rows.slice(offset, offset + 250))
  }
}

/** Refuse collisions with records that were not created by this fixture set. */
async function checkFixtureOwnership(tx: Prisma.TransactionClient, data: DevSeedData) {
  const servers = await tx.gm_server.findMany({ where: { id: { in: data.serverIds } } })
  for (const existing of servers) {
    const expected = data.servers.find((server) => server.id === existing.id)!
    if (existing.guild !== expected.guild || existing.token !== expected.token) {
      throw new Error(`Refusing to overwrite an existing non-demo server: ${existing.id}`)
    }
  }
  const users = await tx.gm_user.findMany({ where: { id: { in: data.users.map((user) => user.id) } } })
  for (const existing of users) {
    const expected = data.users.find((user) => user.id === existing.id)!
    if (existing.username !== expected.username || existing.steam !== expected.steam) {
      throw new Error(`Refusing to overwrite an existing non-demo user: ${existing.id}`)
    }
  }
  const steamUsers = await tx.gm_user_steam.findMany({
    where: { steam_id: { in: data.steamUsers.map((user) => user.steam_id) } },
  })
  for (const existing of steamUsers) {
    const expected = data.steamUsers.find((user) => user.steam_id === existing.steam_id)!
    if (existing.username !== expected.username) {
      throw new Error(`Refusing to overwrite an existing non-demo Steam user: ${existing.steam_id}`)
    }
  }
  const legacyUsers = await tx.users.findMany({
    where: { steamID64: { in: data.legacyUsers.map((user) => user.steamID64) } },
  })
  for (const existing of legacyUsers) {
    const expected = data.legacyUsers.find((user) => user.steamID64 === existing.steamID64)!
    if (existing.name !== expected.name) {
      throw new Error(`Refusing to overwrite an existing non-demo legacy user: ${existing.steamID64}`)
    }
  }
}

/** Only replace children of the stable demo server IDs; never reset the database. */
export async function writeDevSeed(prisma: PrismaClient, mongo: MongoClient, data: DevSeedData) {
  const db = mongo.db('gmod_integration')
  // Check both stores before committing fixtures to SQL.
  await db.command({ ping: 1 })

  await prisma.$transaction(
    async (tx) => {
      await checkFixtureOwnership(tx, data)
      for (const row of data.servers) {
        await tx.gm_server.upsert({ where: { id: row.id }, create: row, update: row })
      }
      for (const row of data.steamUsers) {
        await tx.gm_user_steam.upsert({ where: { steam_id: row.steam_id }, create: row, update: row })
      }
      for (const row of data.users) {
        await tx.gm_user.upsert({ where: { id: row.id }, create: row, update: row })
      }
      for (const row of data.legacyUsers) {
        await tx.users.upsert({ where: { steamID64: row.steamID64 }, create: row, update: row })
      }

      const servers = { in: data.serverIds }
      await tx.gm_server_stat_session.deleteMany({ where: { serverID: servers } })
      await tx.gm_server_stat_team_time.deleteMany({ where: { serverID: servers } })
      await tx.gm_server_stat.deleteMany({ where: { server_id: servers } })
      await tx.gm_server_status_history.deleteMany({ where: { serverID: servers } })
      await tx.gm_server_warn.deleteMany({ where: { serverID: servers } })
      await tx.gm_server_ban.deleteMany({ where: { serverID: servers } })
      await tx.gm_server_vote.deleteMany({ where: { serverID: servers } })
      await tx.gm_server_report_bugs.deleteMany({ where: { serverID: servers } })
      await insertBatches(data.playerStats, (rows) => tx.gm_server_stat.createMany({ data: rows }))
      await insertBatches(data.teamTimes, (rows) => tx.gm_server_stat_team_time.createMany({ data: rows }))
      await insertBatches(data.sessions, (rows) => tx.gm_server_stat_session.createMany({ data: rows }))
      await insertBatches(data.statusHistory, (rows) => tx.gm_server_status_history.createMany({ data: rows }))
      await insertBatches(data.warns, (rows) => tx.gm_server_warn.createMany({ data: rows }))
      await insertBatches(data.bans, (rows) => tx.gm_server_ban.createMany({ data: rows }))
      await insertBatches(data.votes, (rows) => tx.gm_server_vote.createMany({ data: rows }))
      await insertBatches(data.bugReports, (rows) => tx.gm_server_report_bugs.createMany({ data: rows }))
      for (const row of data.statuses) {
        await tx.gm_server_status.upsert({ where: { id: row.id }, create: row, update: row })
      }

      // Extra dashboard examples stay on the original three integration servers.
      const dashboardServers = { in: data.discordServerIds }
      await tx.gm_server_screenshots.deleteMany({
        where: { serverID: dashboardServers, title: { startsWith: '[DEMO]' } },
      })
      await insertBatches(data.screenshots, (rows) => tx.gm_server_screenshots.createMany({ data: rows }))
      for (const row of data.pseudos) {
        const existing = await tx.gm_server_pseudo.findFirst({ where: { serverID: row.serverID, role: row.role } })
        if (!existing) await tx.gm_server_pseudo.create({ data: row })
        else if (existing.name.startsWith('[DEMO]'))
          await tx.gm_server_pseudo.update({ where: { id: existing.id }, data: row })
      }
      for (const row of data.settings) {
        // Preserve developer changes and previously configured integrations.
        await tx.gm_server_settings.upsert({
          where: { serverID_setting: { serverID: row.serverID, setting: row.setting } },
          create: row,
          update: {},
        })
      }
      for (const row of data.chatFilters) {
        const existing = await tx.gm_server_sync_chat_filter.findFirst({
          where: { serverID: row.serverID, trigger: row.trigger },
        })
        if (existing) await tx.gm_server_sync_chat_filter.update({ where: { id: existing.id }, data: row })
        else await tx.gm_server_sync_chat_filter.create({ data: row })
      }
      for (const row of data.logTriggers) {
        const existing = await tx.gm_server_logs_triggers.findFirst({
          where: { serverID: row.serverID, log_type: row.log_type, message: row.message },
        })
        const logs = await tx.gm_server_logs_channel.findUnique({ where: { serverID: row.serverID } })
        const trigger = { ...row, channelID: logs?.channelID || row.channelID }
        if (existing) await tx.gm_server_logs_triggers.update({ where: { id: existing.id }, data: trigger })
        else await tx.gm_server_logs_triggers.create({ data: trigger })
      }

      for (const row of data.links) {
        await tx.gm_server_links.deleteMany({ where: { guild: row.guild, alias: row.alias } })
        await tx.gm_server_links.create({ data: row })
      }
      for (const row of data.notifications) {
        await tx.gm_users_notifications.deleteMany({ where: { discordID: row.discordID, message: row.message } })
        await tx.gm_users_notifications.create({ data: row })
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  )

  // Use actual ObjectIds so the error detail endpoints accept the seeded document IDs.
  const logs = data.mongoLogs.map((row) => ({ ...row, _id: new ObjectId(row._id), devSeed: MONGO_SEED_MARKER }))
  const errors = data.mongoErrors.map((row) => ({ ...row, _id: new ObjectId(row._id), devSeed: MONGO_SEED_MARKER }))
  const filter = { serverID: { $in: data.serverIds }, devSeed: MONGO_SEED_MARKER }
  await db.collection('logs').deleteMany(filter)
  await db.collection('errors').deleteMany(filter)
  if (logs.length) await db.collection('logs').insertMany(logs)
  if (errors.length) await db.collection('errors').insertMany(errors)
}
