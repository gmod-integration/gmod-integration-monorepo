import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This file exercises discord/index.ts's module-level `setInterval(..., 30000)` bot-status-
// rotation block in isolation, since it isn't exported - it's only reachable by advancing fake
// timers past its 30s period after populating the module's internal clientList via a real boot.

vi.useFakeTimers()

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

vi.mock('@gmod/config', () => ({
  ConfigServer: { dev: true },
  ConfigDiscord: { botToken: 'main-bot-token' },
}))

vi.mock('@gmod/core/models/v3/mainModels.js', () => ({
  routinePremiumRoleOfMainGuild: vi.fn().mockResolvedValue(undefined),
  routineServerStatusRefresh: vi.fn().mockResolvedValue(undefined),
  routineUpdateStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: vi.fn() }))
vi.mock('@gmod/infra-redis', () => ({ default: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }))

const gmGuildSettingsFindManyMock = vi.fn()
const prismaMock: any = {
  gm_gmodstore_purchases: { findMany: vi.fn(), findFirst: vi.fn() },
  gm_guild_settings: { findMany: gmGuildSettingsFindManyMock },
  gm_server_pseudo: { findFirst: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock }))

class FakeGuildDomain {
  id: string
  constructor(dscGuild: any) {
    this.id = dscGuild.id
  }
}
const guildSettingExistsMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: FakeGuildDomain, guildSettingExists: guildSettingExistsMock }))

class FakeClient extends EventEmitter {
  user: any = null
  readyAt: Date | null = null
  guilds = { cache: new Map<string, any>() }
  destroy = vi.fn().mockResolvedValue(undefined)
  async login(_token: string) {
    this.user = { tag: 'Bot#0001', id: 'bot1', globalName: 'Bot', setPresence: vi.fn() }
    this.readyAt = new Date()
    queueMicrotask(() => this.emit('clientReady'))
    return 'token'
  }
}
class FakeREST {
  setToken() {
    return this
  }
  put = vi.fn()
  get = vi.fn()
  delete = vi.fn()
}
vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>()
  return { ...actual, Client: FakeClient, REST: FakeREST }
})

const forkMock = vi.fn(() => ({
  on: (event: string, cb: (code: number) => void) => {
    if (event === 'exit') queueMicrotask(() => cb(0))
  },
  send: vi.fn(),
}))
vi.mock('node:child_process', () => ({ fork: forkMock }))
vi.mock('child_process', () => ({ fork: forkMock }))

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false), readdirSync: vi.fn(() => []) }))
vi.mock('fs', () => ({ existsSync: vi.fn(() => false), readdirSync: vi.fn(() => []) }))
vi.mock('node:fs/promises', () => ({ readdir: vi.fn().mockResolvedValue([]) }))
vi.mock('fs/promises', () => ({ readdir: vi.fn().mockResolvedValue([]) }))

const { loadGuildBotInstance } = await import('../../src/discord/index.js')

async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

async function bootClient(guildID: string) {
  prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: guildID, token: 'tok' })
  await loadGuildBotInstance(guildID)
  await tick()
}

function resetAllMocks() {
  gmLogMock.mockClear()
  gmGuildSettingsFindManyMock.mockReset()
  guildSettingExistsMock.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
  prismaMock.gm_gmodstore_purchases.findFirst.mockReset()
  forkMock.mockClear()
}

describe('discord/index status-rotation setInterval', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns early without querying settings when bot_status setting does not exist anywhere', async () => {
    guildSettingExistsMock.mockResolvedValueOnce(false)
    await tick(30000)
    expect(gmGuildSettingsFindManyMock).not.toHaveBeenCalled()
  })

  it('skips a guild with no tracked client', async () => {
    guildSettingExistsMock.mockResolvedValueOnce(true)
    gmGuildSettingsFindManyMock.mockResolvedValueOnce([{ guildID: 'not-booted', value: 'rotate' }])
    await tick(30000)
    // No throw, no setPresence call possible since no client exists for this guild.
  })

  it('skips a guild whose client has no user yet', async () => {
    await bootClient('g-nouser')
    const mod = await import('../../src/discord/index.js')
    const client = await mod.getGuildClient('g-nouser', false)
    client.user = null

    guildSettingExistsMock.mockResolvedValueOnce(true)
    gmGuildSettingsFindManyMock.mockResolvedValueOnce([{ guildID: 'g-nouser', value: 'rotate' }])
    await tick(30000)
  })

  it('skips a guild missing from the client guild cache', async () => {
    await bootClient('g-nocache')
    guildSettingExistsMock.mockResolvedValueOnce(true)
    gmGuildSettingsFindManyMock.mockResolvedValueOnce([{ guildID: 'g-nocache', value: 'rotate' }])
    await tick(30000)
  })

  it('rotates through the status list on successive ticks', async () => {
    await bootClient('g-rotate')
    const mod = await import('../../src/discord/index.js')
    const client = await mod.getGuildClient('g-rotate', false)
    client.guilds.cache.set('g-rotate', { id: 'g-rotate', memberCount: 42 })

    guildSettingExistsMock.mockResolvedValue(true)
    gmGuildSettingsFindManyMock.mockResolvedValue([{ guildID: 'g-rotate', value: 'rotate' }])
    getServersFromDiscordGuildIDMock.mockResolvedValue([
      { getStatusData: vi.fn().mockResolvedValue({ players: 3, maxPlayers: 10 }) },
      { getStatusData: vi.fn().mockResolvedValue(null) },
    ])

    await tick(30000)
    expect(client.user.setPresence).toHaveBeenCalledTimes(1)
    const firstCall = client.user.setPresence.mock.calls[0][0]
    expect(firstCall.activities[0].name).toContain('players')

    await tick(30000)
    expect(client.user.setPresence).toHaveBeenCalledTimes(2)
    const secondCall = client.user.setPresence.mock.calls[1][0]
    expect(secondCall.activities[0].name).toContain('members')

    expect(gmLogMock).toHaveBeenCalledWith(
      'discord',
      expect.stringContaining('Updated custom status for'),
    )
  })

  it('sets a named custom status directly when it matches a known key', async () => {
    await bootClient('g-named')
    const mod = await import('../../src/discord/index.js')
    const client = await mod.getGuildClient('g-named', false)
    client.guilds.cache.set('g-named', { id: 'g-named', memberCount: 7 })

    guildSettingExistsMock.mockResolvedValueOnce(true)
    gmGuildSettingsFindManyMock.mockResolvedValueOnce([{ guildID: 'g-named', value: 'guildMemberCount' }])
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([])

    await tick(30000)
    expect(client.user.setPresence).toHaveBeenCalledTimes(1)
    expect(client.user.setPresence.mock.calls[0][0].activities[0].name).toContain('7 members')
  })

  it('does not set a presence for an unrecognized custom status value', async () => {
    await bootClient('g-unknown')
    const mod = await import('../../src/discord/index.js')
    const client = await mod.getGuildClient('g-unknown', false)
    client.guilds.cache.set('g-unknown', { id: 'g-unknown', memberCount: 1 })

    guildSettingExistsMock.mockResolvedValueOnce(true)
    gmGuildSettingsFindManyMock.mockResolvedValueOnce([{ guildID: 'g-unknown', value: 'not-a-real-status' }])
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([])

    await tick(30000)
    expect(client.user.setPresence).not.toHaveBeenCalled()
  })

  it('logs and swallows an error thrown while updating a guild status', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await bootClient('g-boom')
    const mod = await import('../../src/discord/index.js')
    const client = await mod.getGuildClient('g-boom', false)
    client.guilds.cache.set('g-boom', { id: 'g-boom', memberCount: 1 })

    guildSettingExistsMock.mockResolvedValueOnce(true)
    gmGuildSettingsFindManyMock.mockResolvedValueOnce([{ guildID: 'g-boom', value: 'rotate' }])
    getServersFromDiscordGuildIDMock.mockRejectedValueOnce(new Error('server lookup boom'))

    await tick(30000)
    expect(errorSpy).toHaveBeenCalled()
    expect(gmLogMock).toHaveBeenCalledWith('discord', expect.stringContaining('Failed to update custom status'))
  })
})
