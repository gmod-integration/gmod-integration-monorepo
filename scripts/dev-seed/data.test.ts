import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ObjectId } from 'mongodb'
import { GmodPlayersListSchema } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import { GmodErrorsSchema } from '@gmod/schema/gmod/GmodErrorsSchema.js'
import { buildDevSeedData, DEV_SEED_LABEL, type DevSeedOptions } from './data.js'

const DAY = 24 * 60 * 60 * 1000
const options: DevSeedOptions = {
  guildId: '123456789012345678',
  ownerDiscordId: '234567890123456789',
  now: new Date('2026-11-20T12:00:00.000Z'),
}

function milliseconds(value: Date | string | null | undefined): number {
  assert.ok(value, 'fixture dates must be explicit')
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime()
  assert.ok(Number.isFinite(result), 'fixture dates must be valid')
  return result
}

test('fixtures are deterministic, guild-scoped and independent of the current clock', () => {
  const data = buildDevSeedData(options)
  assert.deepEqual(data, buildDevSeedData(options))
  assert.equal(options.now.toISOString(), '2026-11-20T12:00:00.000Z')

  const otherGuild = buildDevSeedData({ ...options, guildId: '345678901234567890' })
  for (const [first, second] of [
    [data.serverIds, otherGuild.serverIds],
    [data.servers.map((server) => server.token), otherGuild.servers.map((server) => server.token)],
    [data.steamUsers.map((user) => user.steam_id), otherGuild.steamUsers.map((user) => user.steam_id)],
    [data.users.map((user) => user.id), otherGuild.users.map((user) => user.id)],
    [data.mongoLogs.map((log) => log._id), otherGuild.mongoLogs.map((log) => log._id)],
  ]) {
    assert.ok(first.length > 0)
    const occupied = new Set(first)
    assert.ok(
      second.every((id) => !occupied.has(id)),
      'guild fixtures must not overwrite one another',
    )
  }

  const later = buildDevSeedData({ ...options, now: new Date(options.now.getTime() + DAY) })
  assert.deepEqual(data.serverIds, later.serverIds, 'a new seed date must preserve fixture ownership')
  assert.deepEqual(
    data.steamUsers.map((user) => user.steam_id),
    later.steamUsers.map((user) => user.steam_id),
  )
  assert.equal(milliseconds(later.statusHistory[0].createdAt) - milliseconds(data.statusHistory[0].createdAt), DAY)
})

test('fixture identities use valid Steam representations and synthetic, unprivileged Discord users', () => {
  const data = buildDevSeedData(options)
  const steamBase = 76561197960265728n
  const steamIds = new Set(data.steamUsers.map((user) => user.steam_id))
  assert.equal(steamIds.size, data.steamUsers.length)
  assert.ok(steamIds.size > 1)
  for (const user of data.legacyUsers) {
    assert.match(user.steamID64, /^\d{17}$/)
    const account = BigInt(user.steamID64) - steamBase
    assert.ok(account >= 0n && account <= 0xffffffffn, 'Steam accounts must fit the individual account namespace')
    assert.equal(user.steamID, `STEAM_0:${account % 2n}:${account / 2n}`)
    assert.ok(steamIds.has(user.steamID64))
  }
  const discordIds = new Set(data.users.map((user) => user.id))
  assert.equal(discordIds.size, data.users.length)
  for (const user of data.users) {
    assert.match(user.id, /^\d{17,20}$/)
    assert.notEqual(user.id, options.ownerDiscordId, 'the builder must not overwrite the real developer account')
    assert.ok(BigInt(user.id) <= 0xffffffffffffffffn)
    const snowflakeDate = (BigInt(user.id) >> 22n) + 1420070400000n
    assert.ok(snowflakeDate > BigInt(options.now.getTime()), 'generated Discord IDs must be future fixtures')
    assert.equal(user.rank, 'user')
    assert.equal(user.token, undefined)
    assert.equal(user.token_expires, undefined)
    assert.ok(user.steam && steamIds.has(user.steam))
  }
})

test('all SQL and document references remain within the generated fixture graph', () => {
  const data = buildDevSeedData(options)
  const serverIds = new Set(data.servers.map((server) => server.id))
  const steamIds = new Set(data.steamUsers.map((user) => user.steam_id))
  const discordIds = new Set(data.users.map((user) => user.id))
  const playerPairs = new Set(data.playerStats.map((stat) => `${stat.server_id}:${stat.steam_id}`))
  assert.equal(serverIds.size, data.servers.length)
  assert.equal(playerPairs.size, data.playerStats.length, 'composite statistics keys must be unique')
  assert.deepEqual(new Set(data.serverIds), serverIds)
  assert.equal(data.servers.filter((server) => server.isPublic).length, 100)
  assert.equal(data.discordServerIds.length, 3)
  assert.ok(data.discordServerIds.every((id) => serverIds.has(id)))
  for (const server of data.servers) {
    assert.equal(server.guild, options.guildId)
    assert.ok(server.id.length <= 17, 'server IDs must fit legacy CHAR(17) foreign keys')
  }
  for (const stat of data.playerStats) {
    assert.ok(serverIds.has(stat.server_id))
    assert.ok(steamIds.has(stat.steam_id))
  }
  for (const row of [...data.teamTimes, ...data.sessions]) {
    assert.ok(row.serverID && serverIds.has(row.serverID))
    assert.ok(row.steamID64 && steamIds.has(row.steamID64))
    assert.ok(playerPairs.has(`${row.serverID}:${row.steamID64}`))
  }
  for (const row of [...data.warns, ...data.bans]) {
    assert.ok(serverIds.has(row.serverID))
    assert.ok(steamIds.has(row.userSteamID64))
    assert.ok(steamIds.has(row.adminSteamID64))
    assert.ok(playerPairs.has(`${row.serverID}:${row.userSteamID64}`))
  }
  for (const vote of data.votes) {
    assert.ok(serverIds.has(vote.serverID))
    assert.ok(discordIds.has(vote.userID))
  }
  for (const report of data.bugReports) {
    assert.ok(playerPairs.has(`${report.serverID}:${report.steamID64}`))
  }
  for (const document of [...data.statusHistory, ...data.mongoLogs, ...data.mongoErrors]) {
    assert.ok(serverIds.has(document.serverID))
  }
  for (const log of data.mongoLogs) {
    assert.ok(log.playerInvolvedSteamID64.every((id) => playerPairs.has(`${log.serverID}:${id}`)))
  }
  for (const error of data.mongoErrors) {
    assert.ok(playerPairs.has(`${error.serverID}:${error.steamID64}`))
  }
  for (const link of data.links) assert.equal(link.guild, options.guildId)
  for (const notification of data.notifications) assert.equal(notification.discordID, options.ownerDiscordId)
})

test('per-server and aggregate player statistics agree with sessions and team time', () => {
  const data = buildDevSeedData(options)
  for (const stat of data.playerStats) {
    const teams = data.teamTimes.filter((row) => row.serverID === stat.server_id && row.steamID64 === stat.steam_id)
    const sessions = data.sessions.filter((row) => row.serverID === stat.server_id && row.steamID64 === stat.steam_id)
    assert.ok(teams.length > 0 && sessions.length > 0)
    assert.equal(
      teams.reduce((total, row) => total + (row.time ?? 0), 0),
      stat.total_time,
    )
    assert.ok(sessions.reduce((total, row) => total + (row.time ?? 0), 0) <= (stat.total_time ?? 0))
    assert.ok(sessions.reduce((total, row) => total + (row.kills ?? 0), 0) <= (stat.total_kill ?? 0))
    assert.ok(sessions.reduce((total, row) => total + (row.deaths ?? 0), 0) <= (stat.total_death ?? 0))
    assert.ok(sessions.length <= (stat.total_connect ?? 0))
    for (const session of sessions) {
      assert.ok((session.time ?? 0) > 0)
      assert.ok(milliseconds(session.sessionEndTimeStamp) >= milliseconds(stat.first_join))
    }
    assert.ok(milliseconds(stat.first_join) <= milliseconds(stat.last_connect))
    assert.doesNotThrow(() => JSON.parse(stat.custom_values))
  }
  for (const user of data.steamUsers) {
    const stats = data.playerStats.filter((row) => row.steam_id === user.steam_id)
    for (const key of ['total_time', 'total_death', 'total_kill', 'total_connect'] as const) {
      assert.equal(
        user[key],
        stats.reduce((total, row) => total + (row[key] ?? 0), 0),
      )
    }
    assert.equal(milliseconds(user.last_connect), Math.max(...stats.map((row) => milliseconds(row.last_connect))))
  }
})

test('statuses and histories represent usable online and offline scenarios with valid player payloads', () => {
  const data = buildDevSeedData(options)
  const steamIds = new Set(data.steamUsers.map((user) => user.steam_id))
  assert.ok(data.statuses.some((status) => (status.players ?? 0) > 0))
  assert.ok(data.statuses.some((status) => status.players === 0))
  assert.ok(new Set(data.statuses.map((status) => status.gameMode)).size > 1)
  for (const status of data.statuses) {
    assert.ok(status.playersList)
    const players = GmodPlayersListSchema.parse(JSON.parse(status.playersList))
    assert.equal(players.length, status.players)
    assert.ok(players.every((player) => steamIds.has(player.steamID64)))
    const history = data.statusHistory.filter((point) => point.serverID === status.id)
    assert.ok(history.some((point) => milliseconds(point.createdAt) < options.now.getTime() - DAY))
    const latest = history.reduce((a, b) => (milliseconds(a.createdAt) > milliseconds(b.createdAt) ? a : b))
    assert.equal(latest.players, status.players, 'the newest history point must agree with the current snapshot')
    for (const point of history) {
      assert.ok(Number.isInteger(point.players))
      assert.ok((point.players ?? 0) >= 0 && (point.players ?? 0) <= (status.maxPlayers ?? 0))
    }
  }
})

test('all stored dates are explicit, historical and shifted relative to the supplied seed time', () => {
  const data = buildDevSeedData(options)
  const dateFields = new Set([
    'createdAt',
    'updatedAt',
    'first_join',
    'last_connect',
    'sessionEndTimeStamp',
    'last_oauth',
  ])
  for (const rows of Object.values(data)) {
    for (const row of rows) {
      if (typeof row !== 'object') continue
      for (const [key, value] of Object.entries(row)) {
        if (!dateFields.has(key)) continue
        assert.ok(value instanceof Date)
        assert.ok(Number.isFinite(value.getTime()))
        assert.ok(value.getTime() <= options.now.getTime(), `${key} must not be in the future`)
      }
    }
  }
})

test('Mongo documents have unique reproducible ObjectIds and parseable error payloads', () => {
  const data = buildDevSeedData(options)
  const ids = new Set<string>()
  for (const document of [...data.mongoLogs, ...data.mongoErrors]) {
    assert.match(document._id, /^[a-f0-9]{24}$/)
    assert.equal(new ObjectId(document._id).toHexString(), document._id)
    assert.ok(!ids.has(document._id), 'different documents and collections must not share fixture IDs')
    ids.add(document._id)
  }
  for (const error of data.mongoErrors) {
    assert.ok(GmodErrorsSchema.safeParse(error).success)
    assert.ok(Array.isArray(JSON.parse(error.stack)), 'the dashboard expects a JSON stack string')
  }
})

test('fixtures are visibly marked and cannot configure real Discord, billing or OAuth destinations', () => {
  const data = buildDevSeedData(options)
  assert.ok(!Object.keys(data).some((key) => /premium|oauth|panelToken|discordToken|webhook|channel/i.test(key)))
  for (const server of data.servers) {
    assert.ok(server.name?.includes(DEV_SEED_LABEL))
    assert.ok(server.description?.includes(DEV_SEED_LABEL))
    assert.ok(server.token.startsWith('demo-only-'))
    assert.equal(server.isPublic, !data.discordServerIds.includes(server.id))
    if (data.discordServerIds.includes(server.id)) assert.equal(server.image, '')
    else assert.match(server.image ?? '', /^http:\/\/localhost:3000\/dev-seed\/server-(?:[1-9]|10)\.svg$/)
    assert.match(server.ip ?? '', /^192\.0\.2\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/)
  }
  for (const user of data.steamUsers) {
    assert.ok(user.username?.includes(DEV_SEED_LABEL))
    assert.match(user.last_ip ?? '', /^198\.51\.100\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/)
  }
  for (const user of data.users) assert.ok(user.username?.includes(DEV_SEED_LABEL))
  for (const user of data.legacyUsers) {
    assert.ok(user.name?.includes(DEV_SEED_LABEL))
    assert.deepEqual(JSON.parse(user.IPS), [user.lastIP])
  }
  for (const link of data.links) {
    assert.ok(link.alias?.startsWith(DEV_SEED_LABEL))
    assert.equal(link.active, false)
    assert.equal(new URL(link.url ?? '').hostname, 'example.com')
  }
  for (const notification of data.notifications) assert.ok(notification.message.startsWith(DEV_SEED_LABEL))
  for (const punishment of [...data.warns, ...data.bans]) assert.ok(punishment.reason.startsWith(DEV_SEED_LABEL))
  for (const report of data.bugReports) {
    assert.ok(report.description.startsWith(DEV_SEED_LABEL))
    assert.equal(report.screenshot, '')
  }
  for (const error of data.mongoErrors) assert.equal(error.workshopID, '')
})

test('invalid owner, guild or timestamp inputs are rejected before fixtures are generated', () => {
  for (const input of [
    { ...options, guildId: ' ' },
    { ...options, ownerDiscordId: '' },
    { ...options, now: new Date(Number.NaN) },
  ])
    assert.throws(() => buildDevSeedData(input), /required for development fixtures/)
})
