import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GmodPlayerSchema } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import { buildDevSeedData, type DevSeedOptions } from './data.js'
import { appendDashboardSeedData } from './dashboard.js'

const options: DevSeedOptions = {
  guildId: '123456789012345678',
  ownerDiscordId: '234567890123456789',
  now: new Date('2026-11-20T12:00:00.000Z'),
  assetBaseUrl: 'http://localhost:3000',
}

function fixtures(overrides: Partial<DevSeedOptions> = {}) {
  const actualOptions = { ...options, ...overrides }
  const data = buildDevSeedData(actualOptions)
  data.screenshots = []
  data.pseudos = []
  data.settings = []
  data.chatFilters = []
  data.logTriggers = []
  return { data, options: actualOptions }
}

test('dashboard fixtures fill multiple screenshot pages with valid player and capture metadata', () => {
  const { data } = fixtures()
  appendDashboardSeedData(data, options)
  assert.equal(data.screenshots.length, 72)
  for (const serverID of data.discordServerIds) {
    const rows = data.screenshots.filter((row) => row.serverID === serverID)
    assert.equal(rows.length, 24)
    assert.equal(new Set(rows.map((row) => row.title)).size, 24)
    for (const row of rows) {
      const player = GmodPlayerSchema.parse(JSON.parse(row.player))
      assert.ok(data.playerStats.some((stat) => stat.server_id === serverID && stat.steam_id === player.steamID64))
      const capture = JSON.parse(row.captureData)
      assert.equal(capture.w / capture.h, 16 / 9)
      assert.ok(capture.quality >= 1 && capture.quality <= 100)
      assert.equal(capture.demo, true)
      assert.match(row.url!, /^http:\/\/localhost:3000\/dev-seed\/capture-[123]\.svg$/)
      assert.ok(row.createdAt instanceof Date && row.createdAt < options.now)
    }
  }
})

test('dashboard fixtures populate roles, config and chat examples with different states', () => {
  const { data } = fixtures()
  appendDashboardSeedData(data, options)
  assert.equal(data.pseudos.length, 12)
  assert.equal(data.settings.length, 39)
  assert.equal(data.chatFilters.length, 9)
  assert.equal(data.logTriggers.length, 2)
  assert.ok(data.pseudos.some((row) => row.enabled) && data.pseudos.some((row) => !row.enabled))
  assert.ok(data.chatFilters.some((row) => row.active) && data.chatFilters.some((row) => !row.active))
  assert.equal(new Set(data.settings.map((row) => `${row.serverID}:${row.setting}`)).size, data.settings.length)
  for (const row of data.settings.filter((row) => row.setting === 'ig_adminRank')) {
    assert.deepEqual(JSON.parse(row.value), { superadmin: true, admin: true })
  }
  assert.equal(
    data.settings.find((row) => row.serverID === data.discordServerIds[0] && row.setting === 'ig_maintenance')?.value,
    'false',
  )
  assert.equal(
    data.settings.find((row) => row.serverID === data.discordServerIds[2] && row.setting === 'ig_maintenance')?.value,
    'true',
  )
  for (const row of data.logTriggers) {
    assert.equal(row.channelID, '')
    assert.equal(row.adminIDS, '[]')
    assert.equal(row.action, 'sendMessageInChannel')
    assert.ok(Number(row.value) > 0)
    assert.ok(data.statuses.some((status) => status.id === row.serverID && status.gameMode === 'darkrp'))
  }
})

test('dashboard fixture generation stays scoped to the three integrated servers and is deterministic', () => {
  const first = fixtures()
  first.data.serverIds.push('public-sample')
  const sourceServers = structuredClone(first.data.servers)
  const sourceStats = structuredClone(first.data.playerStats)
  appendDashboardSeedData(first.data, options)
  const second = fixtures()
  appendDashboardSeedData(second.data, options)
  for (const key of ['screenshots', 'pseudos', 'settings', 'chatFilters', 'logTriggers'] as const) {
    assert.deepEqual(first.data[key], second.data[key])
    assert.ok(first.data[key].every((row) => first.data.discordServerIds.includes(row.serverID)))
  }
  assert.deepEqual(first.data.servers, sourceServers)
  assert.deepEqual(first.data.playerStats, sourceStats)
})

test('log trigger templates reference fields present in their actual money event payloads', () => {
  const { data } = fixtures()
  appendDashboardSeedData(data, options)
  const player = JSON.parse(data.screenshots[0].player)
  const events: Record<string, Record<string, unknown>> = {
    dark_rp_drop_money: { amount: 2000000, player },
    dark_rp_picked_up_cheque: { amount: 6000000, playerChequeWriter: player, playerChequeTarget: player },
  }
  assert.equal(new Set(data.logTriggers.map((row) => row.message)).size, 2)
  for (const trigger of data.logTriggers) {
    const placeholders = [...trigger.message!.matchAll(/{{data\.([^}]+)}}/g)]
    assert.ok(placeholders.length >= 2)
    for (const [, path] of placeholders) {
      let value: unknown = events[trigger.log_type]
      for (const key of path.split('.')) value = (value as Record<string, unknown>)?.[key]
      assert.notEqual(value, undefined, `${trigger.log_type}: ${path} must exist in the event`)
    }
  }
})

test('screenshot asset origins follow the development website configuration and reject credentials', () => {
  const alternate = fixtures({ assetBaseUrl: 'https://dashboard.example.test:8443' })
  appendDashboardSeedData(alternate.data, alternate.options)
  assert.ok(
    alternate.data.screenshots.every((row) => new URL(row.url!).origin === 'https://dashboard.example.test:8443'),
  )
  for (const assetBaseUrl of ['file:///tmp/site', 'https://developer:secret@example.test']) {
    const { data } = fixtures()
    assert.throws(
      () => appendDashboardSeedData(data, { ...options, assetBaseUrl }),
      /HTTP website URL without credentials/,
    )
    assert.equal(data.screenshots.length, 0)
  }
})
