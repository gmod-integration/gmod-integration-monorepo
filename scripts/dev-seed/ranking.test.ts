import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GmodPlayersListSchema } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import { GmodErrorsSchema } from '@gmod/schema/gmod/GmodErrorsSchema.js'
import { buildDevSeedData, type DevSeedData, type DevSeedOptions } from './data.js'
import { appendRankingSeedData } from './ranking.js'

const DAY = 24 * 60 * 60 * 1000
const options: DevSeedOptions = {
  guildId: '123456789012345678',
  ownerDiscordId: '234567890123456789',
  now: new Date('2026-11-20T12:00:00.000Z'),
  assetBaseUrl: 'http://localhost:3000',
}
const isRanking = (id: string) => id.startsWith('rank-')
const date = (value: Date | string | undefined | null) => new Date(value!).getTime()

function withoutRanking(data: DevSeedData): DevSeedData {
  for (const [key, rows] of Object.entries(data)) {
    ;(data as unknown as Record<string, unknown[]>)[key] = rows.filter((row) => {
      if (typeof row === 'string') return !isRanking(row)
      const record = row as Record<string, unknown>
      const serverId = record.serverID || record.server_id || record.id
      return typeof serverId !== 'string' || !isRanking(serverId)
    })
  }
  return data
}

test('adds exactly one hundred public ranking servers with deterministic safe identities and varied local images', () => {
  const data = buildDevSeedData(options)
  const ranking = data.servers.filter((server) => isRanking(server.id))
  assert.equal(ranking.length, 100)
  assert.equal(data.servers.filter((server) => server.isPublic).length, 100)
  assert.equal(new Set(data.serverIds).size, data.serverIds.length)
  assert.equal(new Set(ranking.map((server) => server.name)).size, 100)
  assert.equal(new Set(ranking.map((server) => server.image)).size, 10)
  assert.ok(ranking.some((server) => server.verified))
  assert.ok(ranking.some((server) => !server.verified))
  for (const server of ranking) {
    assert.match(server.id, /^rank-[a-f0-9]{8}-\d{3}$/)
    assert.equal(server.id.length, 17)
    assert.equal(server.guild, options.guildId)
    assert.equal(server.isPublic, true)
    assert.match(server.name!, /^\[DEMO\]/)
    assert.match(server.description!, /^\[DEMO\]/)
    assert.match(server.token, /^demo-only-[a-f0-9]{8}-ranking-\d+-not-for-production$/)
    assert.match(server.ip!, /^192\.0\.2\.1\d\d$/)
    assert.match(server.image!, /^http:\/\/localhost:3000\/dev-seed\/server-(?:[1-9]|10)\.svg$/)
  }
})

test('every game mode keeps its corresponding thumbnail across repeated ranking entries', () => {
  const data = buildDevSeedData(options)
  const modeImages = new Map([
    ['darkrp', 1],
    ['sandbox', 2],
    ['terrortown', 3],
    ['murder', 4],
    ['deathrun', 5],
    ['prophunt', 6],
    ['jailbreak', 7],
    ['starwarsrp', 8],
    ['zombiesurvival', 9],
    ['cinema', 10],
  ])
  for (const [gameMode, imageIndex] of modeImages) {
    const statuses = data.statuses.filter((status) => isRanking(status.id) && status.gameMode === gameMode)
    assert.equal(statuses.length, 10, `all repeated ${gameMode} entries are covered`)
    for (const status of statuses) {
      const server = data.servers.find((entry) => entry.id === status.id)!
      assert.equal(server.image, `http://localhost:3000/dev-seed/server-${imageIndex}.svg`)
    }
  }
})

test('ranking fixtures are reproducible and preserve the original integration servers and their children', () => {
  const first = buildDevSeedData(options)
  assert.deepEqual(first, buildDevSeedData(options))
  const original = withoutRanking(first)
  const before = structuredClone(original)
  appendRankingSeedData(original, options)
  for (const [key, rows] of Object.entries(before)) {
    const after = (original as unknown as Record<string, unknown[]>)[key]
    assert.deepEqual(after.slice(0, rows.length), rows, `${key} existing records must not change`)
  }
  const later = buildDevSeedData({ ...options, now: new Date(options.now.getTime() + DAY) })
  assert.deepEqual(original.serverIds, later.serverIds)
  const other = buildDevSeedData({ ...options, guildId: '345678901234567890' })
  const occupied = new Set(original.serverIds)
  assert.ok(other.serverIds.every((id) => !occupied.has(id)))
})

test('ranking votes exercise one hundred distinct thirty-day scores plus excluded historic votes', () => {
  const data = buildDevSeedData(options)
  const discordIds = new Set(data.users.map((user) => user.id))
  const scores = []
  for (const server of data.servers.filter((server) => isRanking(server.id))) {
    const votes = data.votes.filter((vote) => vote.serverID === server.id)
    const recent = votes.filter((vote) => date(vote.createdAt) > options.now.getTime() - 30 * DAY)
    const historic = votes.filter((vote) => date(vote.createdAt) <= options.now.getTime() - 30 * DAY)
    assert.equal(historic.length, 3)
    assert.ok(votes.every((vote) => discordIds.has(vote.userID)))
    assert.ok(votes.every((vote) => date(vote.createdAt) < options.now.getTime()))
    scores.push(recent.length)
  }
  assert.deepEqual(
    scores.sort((a, b) => a - b),
    Array.from({ length: 100 }, (_, index) => index),
  )
})

test('ranking snapshots cover populated, empty, full and offline servers with coherent histories', () => {
  const data = buildDevSeedData(options)
  const snapshots = data.statuses.filter((status) => isRanking(status.id))
  const fresh = (status: (typeof snapshots)[number]) => date(status.updatedAt) >= options.now.getTime() - 5 * 60 * 1000
  assert.equal(snapshots.length, 100)
  assert.ok(snapshots.some((status) => fresh(status) && status.players! > 0))
  assert.ok(snapshots.some((status) => fresh(status) && status.players === 0))
  assert.ok(snapshots.some((status) => !fresh(status)))
  assert.ok(snapshots.some((status) => fresh(status) && status.players === status.maxPlayers))
  assert.ok(new Set(snapshots.map((status) => status.gameMode)).size >= 8)
  assert.ok(new Set(snapshots.map((status) => status.map)).size >= 8)
  const pairs = new Set(data.playerStats.map((stat) => `${stat.server_id}:${stat.steam_id}`))
  for (const snapshot of snapshots) {
    const players = GmodPlayersListSchema.parse(JSON.parse(snapshot.playersList!))
    assert.equal(players.length, snapshot.players)
    assert.ok(players.every((player) => pairs.has(`${snapshot.id}:${player.steamID64}`)))
    assert.ok(snapshot.players! <= snapshot.maxPlayers!)
    const history = data.statusHistory.filter((point) => point.serverID === snapshot.id)
    assert.equal(history.length, 15)
    assert.ok(history.some((point) => date(point.createdAt) <= options.now.getTime() - 14 * DAY))
    assert.equal(history[0].players, snapshot.players)
    assert.ok(history.every((point) => point.players! >= 0 && point.players! <= snapshot.maxPlayers!))
  }
})

test('every ranking server has usable statistics, sessions, moderation, reports, logs and errors', () => {
  const data = buildDevSeedData(options)
  const pairs = new Set(data.playerStats.map((stat) => `${stat.server_id}:${stat.steam_id}`))
  const ids = new Set<string>()
  for (const server of data.servers.filter((server) => isRanking(server.id))) {
    const stats = data.playerStats.filter((stat) => stat.server_id === server.id)
    assert.ok(stats.length >= 8 && stats.length <= 12)
    for (const stat of stats) {
      const sessions = data.sessions.filter((row) => row.serverID === server.id && row.steamID64 === stat.steam_id)
      const teams = data.teamTimes.filter((row) => row.serverID === server.id && row.steamID64 === stat.steam_id)
      assert.equal(sessions.length, 2)
      assert.equal(teams.length, 2)
      assert.equal(
        teams.reduce((sum, row) => sum + row.time!, 0),
        stat.total_time,
      )
      assert.ok(sessions.reduce((sum, row) => sum + row.time!, 0) <= stat.total_time!)
      assert.ok(sessions.reduce((sum, row) => sum + row.kills!, 0) <= stat.total_kill!)
      assert.ok(sessions.reduce((sum, row) => sum + row.deaths!, 0) <= stat.total_death!)
      assert.ok(sessions.every((row) => date(row.sessionEndTimeStamp) >= date(stat.first_join)))
      assert.ok(sessions.every((row) => date(row.sessionEndTimeStamp) <= date(stat.last_connect)))
      assert.ok(date(stat.first_join) < date(stat.last_connect))
    }
    assert.equal(data.warns.filter((row) => row.serverID === server.id).length, 2)
    assert.equal(data.bans.filter((row) => row.serverID === server.id).length, 1)
    assert.equal(data.bugReports.filter((row) => row.serverID === server.id).length, 2)
    assert.equal(data.mongoLogs.filter((row) => row.serverID === server.id).length, 6)
    assert.equal(data.mongoErrors.filter((row) => row.serverID === server.id).length, 1)
  }
  for (const row of [...data.warns, ...data.bans]) {
    assert.ok(pairs.has(`${row.serverID}:${row.userSteamID64}`))
    assert.ok(pairs.has(`${row.serverID}:${row.adminSteamID64}`))
  }
  for (const row of data.bugReports) assert.ok(pairs.has(`${row.serverID}:${row.steamID64}`))
  for (const row of [...data.mongoLogs, ...data.mongoErrors]) {
    assert.match(row._id, /^[a-f0-9]{24}$/)
    assert.ok(!ids.has(row._id))
    ids.add(row._id)
  }
  for (const row of data.mongoErrors) assert.ok(GmodErrorsSchema.safeParse(row).success)
})

test('refuses an incomplete fixture graph before appending ranking servers', () => {
  const data = withoutRanking(buildDevSeedData(options))
  data.playerStats = []
  const before = structuredClone(data)
  assert.throws(() => appendRankingSeedData(data, options), /at least eight/)
  assert.deepEqual(data, before)
})
