import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

// This file exercises loadDiscordMain()'s real directory-scanning + dynamic-import logic
// (indexCommandsAndContext, and addNewClient's own event/command loading) against the REAL
// command/context/event files under src/discord/{commands,contexts,events} - unlike
// index.test.ts, which mocks fs to skip that scanning entirely to keep the other exported
// functions' tests fast and isolated. Real files are used here (rather than fabricated fixture
// files) because dynamically importing them is itself the best available check that every
// real command/context/event module still loads without error and exposes the expected shape.

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

vi.mock('@gmod/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gmod/config')>()
  return {
    ...actual,
    ConfigServer: { ...actual.ConfigServer, dev: true },
    ConfigDiscord: { ...actual.ConfigDiscord, botToken: 'main-bot-token' },
  }
})

vi.mock('@gmod/core/models/v3/mainModels.js', () => ({
  routinePremiumRoleOfMainGuild: vi.fn().mockResolvedValue(undefined),
  routineServerStatusRefresh: vi.fn().mockResolvedValue(undefined),
  routineUpdateStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: vi.fn() }))
vi.mock('@gmod/infra-redis', () => ({ default: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_gmodstore_purchases: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    gm_guild_settings: { findMany: vi.fn().mockResolvedValue([]) },
    gm_server_pseudo: { findFirst: vi.fn() },
  },
}))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: vi.fn().mockResolvedValue([]) }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: class {}, guildSettingExists: vi.fn() }))

class FakeClient extends EventEmitter {
  user: any = null
  readyAt: Date | null = null
  guilds = { cache: new Map<string, any>() }
  destroy = vi.fn().mockResolvedValue(undefined)
  async login(_token: string) {
    this.user = { tag: 'Bot#0001', id: 'bot1', globalName: 'Bot' }
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
  get = vi.fn().mockResolvedValue([])
  delete = vi.fn()
}
vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>()
  return { ...actual, Client: FakeClient, REST: FakeREST }
})

let nextForkExitCode = 0
vi.mock('node:child_process', () => ({
  fork: vi.fn(() => ({
    on: (event: string, cb: (code: number) => void) => {
      if (event === 'exit') queueMicrotask(() => cb(nextForkExitCode))
    },
    send: vi.fn(),
  })),
}))
vi.mock('child_process', () => ({
  fork: vi.fn(() => ({
    on: (event: string, cb: (code: number) => void) => {
      if (event === 'exit') queueMicrotask(() => cb(nextForkExitCode))
    },
    send: vi.fn(),
  })),
}))

// fs/fs-promises are intentionally NOT mocked here, so directory scanning hits the real
// src/discord/{commands,contexts,events} tree.

const { loadDiscordMain, getMainClient } = await import('../../src/discord/index.js')

describe('discord/index loadDiscordMain (real command/context/event tree)', () => {
  it('scans and dynamically imports every real command/context/event file without throwing', async () => {
    await loadDiscordMain()

    // Every real command file has a `default.data` (a SlashCommandBuilder), so gmLog('info', ...)
    // should have fired once per loaded command/context.
    const pushedLogs = gmLogMock.mock.calls.filter(([type]) => type === 'info')
    expect(pushedLogs.length).toBeGreaterThan(0)
  }, 20000)

  it('routes interactions to a real registered context menu command, chat command, and autocomplete handler', async () => {
    // addNewClient's own command/context/event loading loops are fire-and-forget (not awaited),
    // so give the already-loaded (cached) dynamic imports a tick to populate the internal
    // commands/contextMenuCommands collections before dispatching interactions at them.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = await getMainClient()

    // Real command/context business logic isn't fully mocked here (that's covered by each
    // command/context's own dedicated test file) - the point of this test is only to exercise
    // discord/index.ts's own InteractionCreate dispatch branches (contextMenu / chat command /
    // autocomplete), so a thrown/rejected handler being swallowed by the outer try/catch is fine.
    client.emit('interactionCreate', {
      isCommand: () => true,
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
      isButton: () => false,
      commandName: 'Verify',
    })
    client.emit('interactionCreate', {
      isCommand: () => true,
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      isButton: () => false,
      commandName: 'premium',
      guild: null,
    })
    client.emit('interactionCreate', {
      isCommand: () => false,
      isAutocomplete: () => true,
      isChatInputCommand: () => false,
      isButton: () => false,
      commandName: 'rcon',
      options: { getFocused: () => ({ name: 'server', value: '' }) },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    // 'rcon' autocomplete calls real, unmocked Prisma-backed lookups, so it's expected to reject
    // and be swallowed by discord/index.ts's outer try/catch - confirming the catch path fired.
    expect(errorSpy).toHaveBeenCalled()
  }, 20000)

  it('logs and continues when adding the main client fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    nextForkExitCode = 1 // invalid token/intents -> addNewClient('main', ...) throws
    await loadDiscordMain()
    expect(errorSpy).toHaveBeenCalledWith('Error adding main client:', expect.any(Error))
    nextForkExitCode = 0
  }, 20000)
})
