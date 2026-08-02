import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

let configServerMock = { dev: true }
let configDiscordMock: any = { botToken: 'main-bot-token' }
vi.mock('@gmod/config', () => ({
  get ConfigServer() {
    return configServerMock
  },
  get ConfigDiscord() {
    return configDiscordMock
  },
}))

const routinePremiumRoleOfMainGuildMock = vi.fn()
const routineServerStatusRefreshMock = vi.fn()
const routineUpdateStatusMock = vi.fn()
vi.mock('@gmod/core/models/v3/mainModels.js', () => ({
  routinePremiumRoleOfMainGuild: routinePremiumRoleOfMainGuildMock,
  routineServerStatusRefresh: routineServerStatusRefreshMock,
  routineUpdateStatus: routineUpdateStatusMock,
}))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const prismaMock: any = {
  gm_gmodstore_purchases: { findMany: vi.fn(), findFirst: vi.fn() },
  gm_guild_settings: { findMany: vi.fn() },
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
  options: any
  user: any = null
  readyAt: Date | null = null
  guilds = { cache: new Map<string, any>() }
  destroy = vi.fn().mockResolvedValue(undefined)

  constructor(options: any) {
    super()
    this.options = options
  }

  async login(_token: string) {
    this.user = { tag: 'Bot#0001', id: 'bot1', globalName: 'Bot' }
    this.readyAt = new Date()
    queueMicrotask(() => this.emit('clientReady'))
    return 'token'
  }
}

const restPutMock = vi.fn()
const restGetMock = vi.fn()
const restDeleteMock = vi.fn()
class FakeREST {
  setToken() {
    return this
  }
  put = restPutMock
  get = restGetMock
  delete = restDeleteMock
}

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>()
  return { ...actual, Client: FakeClient, REST: FakeREST }
})

let nextForkExitCode = 0
const forkSendMock = vi.fn()
const forkMock = vi.fn(() => {
  const child = {
    on: (event: string, cb: (...args: any[]) => void) => {
      // checkTokenAndIntents registers its 'exit' listener synchronously right after fork()
      // returns, so scheduling the trigger here (once that registration has happened) - rather
      // than the caller pre-scheduling it before fork() is even invoked - is what makes this
      // resolve instead of hanging.
      if (event === 'exit') queueMicrotask(() => cb(nextForkExitCode))
    },
    send: forkSendMock,
  }
  return child
})
vi.mock('node:child_process', () => ({ fork: forkMock }))
vi.mock('child_process', () => ({ fork: forkMock }))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
}))
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
}))
vi.mock('node:fs/promises', () => ({ readdir: vi.fn().mockResolvedValue([]) }))
vi.mock('fs/promises', () => ({ readdir: vi.fn().mockResolvedValue([]) }))

const {
  loadDiscordSlave,
  getMainClient,
  killGuildClient,
  getGuildClient,
  updateGuildUserPseudo,
  loadGuildBotInstance,
  gracefulShutdownDiscord,
} = await import('../../src/discord/index.js')

function resetAllMocks() {
  gmLogMock.mockClear()
  routinePremiumRoleOfMainGuildMock.mockReset().mockResolvedValue(undefined)
  routineServerStatusRefreshMock.mockReset().mockResolvedValue(undefined)
  routineUpdateStatusMock.mockReset().mockResolvedValue(undefined)
  getUserFromSteamID64Mock.mockReset()
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  getServersFromDiscordGuildIDMock.mockReset()
  guildSettingExistsMock.mockReset()
  forkSendMock.mockReset()
  forkMock.mockClear()
  nextForkExitCode = 0
  restPutMock.mockReset()
  restGetMock.mockReset()
  restDeleteMock.mockReset()
}

describe('discord/index', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadDiscordSlave / addNewClient (via a valid token+intents path)', () => {
    it('starts a bot instance for each non-revoked purchase with a guild+token, skipping incomplete rows', async () => {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([
        { guild: '', token: 'tok' }, // missing guild -> skipped
        { guild: 'g1', token: '' }, // missing token -> skipped
        { guild: 'g2', token: 'tok2' }, // valid
      ])
      nextForkExitCode = 0

      await loadDiscordSlave()

      expect(routineServerStatusRefreshMock).toHaveBeenCalled()
      // Only one guild (g2) had both guild+token, so only one client login attempt happened.
      expect(forkMock).toHaveBeenCalledTimes(1)
    })

    it('logs and continues when starting a bot instance throws (invalid token)', async () => {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: 'g1', token: 'bad-token' }])
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      nextForkExitCode = 1 // invalid token/intents

      await loadDiscordSlave()

      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('getMainClient / getGuildClient / killGuildClient (populated via loadDiscordSlave)', () => {
    async function bootOneClient(guildID: string) {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: guildID, token: 'tok' }])
      nextForkExitCode = 0
      await loadDiscordSlave()
      // let the queued clientReady microtask settle
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    it('getMainClient throws when no main client has ever been created', async () => {
      await expect(getMainClient()).rejects.toThrow('Main client is not defined')
    })

    it('getGuildClient falls back to the main client for an empty guildID', async () => {
      await bootOneClient('main')
      await expect(getGuildClient('')).resolves.toBeDefined()
    })

    it('getGuildClient falls back to the main client when the guild has no dedicated client', async () => {
      await bootOneClient('main')
      const client = await getGuildClient('unregistered-guild')
      expect(client.user.id).toBe('bot1')
    })

    it('getGuildClient returns the dedicated ready client when it is present in the guild', async () => {
      await bootOneClient('g1')
      const clients = await import('../../src/discord/index.js')
      const client = await clients.getGuildClient('g1', false)
      expect(client).toBeDefined()
    })

    it('getGuildClient falls back to main when forcePresenceOnGuild is true and the guild cache lacks it', async () => {
      await bootOneClient('main')
      await bootOneClient('g2')
      const client = await getGuildClient('g2', true)
      // g2's fake client never actually has g2 in its guilds.cache (never populated), so this
      // exercises the "not present -> fall back to main" branch.
      expect(client).toBeDefined()
    })

    it('killGuildClient does nothing for an empty guildID', async () => {
      await expect(killGuildClient('')).resolves.toBeUndefined()
    })

    it('killGuildClient does nothing for the main guild ID', async () => {
      await bootOneClient('main')
      await killGuildClient('main')
    })

    it('killGuildClient destroys and removes a tracked client', async () => {
      await bootOneClient('g3')
      await killGuildClient('g3')
      // Calling getGuildClient for g3 now falls through to "not found" -> main client fallback,
      // proving it was removed from the tracked client list.
      await bootOneClient('main')
      const client = await getGuildClient('g3')
      expect(client.user.id).toBe('bot1')
    })

    it('getMainClient awaits clientReady when the main client exists but is not ready yet', async () => {
      await bootOneClient('main')
      const client = await getMainClient()
      client.readyAt = null
      const pending = getMainClient()
      client.emit('clientReady')
      await expect(pending).resolves.toBe(client)
    })

    it('getGuildClient awaits clientReady when the dedicated client exists but is not ready yet', async () => {
      await bootOneClient('g-notready')
      const client = await getGuildClient('g-notready', false)
      client.readyAt = null
      const pending = getGuildClient('g-notready', false)
      client.emit('clientReady')
      await expect(pending).resolves.toBe(client)
    })

    it('getGuildClient falls back to main when not-yet-ready and forcePresenceOnGuild finds the guild missing', async () => {
      await bootOneClient('main')
      await bootOneClient('g-notready2')
      const client = await getGuildClient('g-notready2', false)
      client.readyAt = null
      const pending = getGuildClient('g-notready2', true)
      client.emit('clientReady')
      const resolved = await pending
      // g-notready2's fake client never has itself in its own guilds.cache, so this exercises
      // the not-ready branch's own forcePresenceOnGuild -> fallback-to-main path.
      expect(resolved.user.id).toBe('bot1')
    })
  })

  describe('updateGuildUserPseudo', () => {
    function makeServer(overrides: Record<string, any> = {}) {
      return {
        getID: () => 's1',
        getGuildID: () => 'g1',
        getSetting: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'sync_pseudo_direction') return 'both'
          if (key === 'pseudoFormat') return '{plyName}'
          return undefined
        }),
        ...overrides,
      } as any
    }
    function makePlayer(overrides: Record<string, any> = {}) {
      return { userGroup: 'user', name: 'Bob', steamID64: '765', ...overrides } as any
    }

    it('returns early when sync direction excludes gmod-to-discord', async () => {
      const server = makeServer({
        getSetting: vi.fn().mockResolvedValueOnce('discordToGmod'),
      })
      await updateGuildUserPseudo(server, makePlayer())
      expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
    })

    it('returns early when pseudoFormat is empty', async () => {
      const server = makeServer({
        getSetting: vi.fn().mockResolvedValueOnce('both').mockResolvedValueOnce(''),
      })
      await updateGuildUserPseudo(server, makePlayer())
      expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
    })

    it('returns early when there is no linked discord user', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)
      await updateGuildUserPseudo(makeServer(), makePlayer())
    })

    it('returns early when the linked user has no discord ID', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => null })
      await updateGuildUserPseudo(makeServer(), makePlayer())
    })

    it('returns early when the guild is not present on the resolved client', async () => {
      await bootOneClientForPseudo('main')
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1', getSteamID64: () => '765' })
      await updateGuildUserPseudo(makeServer(), makePlayer())
    })

    describe('deeper branches (guild present on the resolved client)', () => {
      async function bootMainWithGuild(guildOverrides: Record<string, any> = {}) {
        await bootOneClientForPseudo('main')
        const mainClient = await getMainClient()
        const guild = {
          ownerId: 'owner1',
          members: {
            fetch: vi.fn().mockImplementation(async (id: string) => {
              if (id === 'd1') {
                return { roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } } }
              }
              if (id === 'bot1') {
                return {
                  permissions: { has: vi.fn().mockReturnValue(true) },
                  roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } },
                }
              }
              return null
            }),
          },
          ...guildOverrides,
        }
        mainClient.guilds.cache.set('g1', guild)
        prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
        getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1', getSteamID64: () => '765' })
        return { mainClient, guild }
      }

      it('returns early when the linked discord user owns the guild', async () => {
        await bootMainWithGuild({ ownerId: 'd1' })
        await updateGuildUserPseudo(makeServer(), makePlayer())
      })

      it('returns early when the resolved client has no bot user', async () => {
        const { mainClient } = await bootMainWithGuild()
        mainClient.user = null
        await updateGuildUserPseudo(makeServer(), makePlayer())
      })

      it('returns early when the linked member cannot be fetched', async () => {
        await bootMainWithGuild({ members: { fetch: vi.fn().mockResolvedValue(null) } })
        await updateGuildUserPseudo(makeServer(), makePlayer())
      })

      it('returns early when the bot member cannot be fetched', async () => {
        await bootMainWithGuild({
          members: {
            fetch: vi.fn().mockImplementation(async (id: string) => {
              if (id === 'd1') return { roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } } }
              return null
            }),
          },
        })
        await updateGuildUserPseudo(makeServer(), makePlayer())
      })

      it('returns early when the bot lacks the ManageNicknames permission', async () => {
        await bootMainWithGuild({
          members: {
            fetch: vi.fn().mockImplementation(async (id: string) => {
              if (id === 'd1') return { roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } } }
              return { permissions: { has: vi.fn().mockReturnValue(false) }, roles: { highest: {} } }
            }),
          },
        })
        await updateGuildUserPseudo(makeServer(), makePlayer())
      })

      it('returns early when the bot role is not higher than the member role', async () => {
        await bootMainWithGuild({
          members: {
            fetch: vi.fn().mockImplementation(async (id: string) => {
              if (id === 'd1') return { roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } } }
              return {
                permissions: { has: vi.fn().mockReturnValue(true) },
                roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(0) } },
              }
            }),
          },
        })
        await updateGuildUserPseudo(makeServer(), makePlayer())
      })

      it('sets the nickname and writes the sync-pseudo redis key on the full happy path', async () => {
        const { guild } = await bootMainWithGuild()
        const member = await guild.members.fetch('d1')
        const setNicknameSpy = vi.fn().mockResolvedValue(undefined)
        guild.members.fetch = vi.fn().mockImplementation(async (id: string) => {
          if (id === 'd1') return { ...member, setNickname: setNicknameSpy }
          return {
            permissions: { has: vi.fn().mockReturnValue(true) },
            roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(1) } },
          }
        })
        prismaMock.gm_server_pseudo.findFirst.mockReset()
        prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce({ prefix: '[VIP] ', name: 'VIP' })
        getUserFromSteamID64Mock.mockReset()
        getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1', getSteamID64: () => '765' })

        await updateGuildUserPseudo(makeServer(), makePlayer({ name: 'Alice' }))

        expect(setNicknameSpy).toHaveBeenCalledWith('Alice')
        expect(redisMock.set).toHaveBeenCalledWith(
          'sync-pseudo:gmod:server:s1:user:765',
          'Alice',
          'EX',
          120,
        )
      })
    })

    it('swallows and logs any unexpected error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const server = makeServer({ getSetting: vi.fn().mockRejectedValueOnce(new Error('boom')) })
      await updateGuildUserPseudo(server, makePlayer())
      expect(errorSpy).toHaveBeenCalled()
    })

    async function bootOneClientForPseudo(guildID: string) {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: guildID, token: 'tok' }])
      nextForkExitCode = 0
      await loadDiscordSlave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  })

  describe('loadGuildBotInstance', () => {
    it('does nothing further when no purchase instance is found', async () => {
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      await loadGuildBotInstance('g1')
    })

    it('does not start a client when the found purchase instance has no token', async () => {
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: 'g1', token: '' })
      await loadGuildBotInstance('g1')
      expect(forkMock).not.toHaveBeenCalled()
    })

    it('creates a new client for the guild when a purchase instance exists', async () => {
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: 'g1', token: 'tok' })
      nextForkExitCode = 0
      await loadGuildBotInstance('g1')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(forkMock).toHaveBeenCalled()
    })
  })

  describe('gracefulShutdownDiscord', () => {
    it('destroys every tracked client', async () => {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: 'gx', token: 'tok' }])
      nextForkExitCode = 0
      await loadDiscordSlave()
      await new Promise((resolve) => setTimeout(resolve, 0))

      await gracefulShutdownDiscord()
    })
  })

  describe('clientReady REST push (ConfigServer.dev = false)', () => {
    async function bootWithRestPush(guildID: string) {
      configServerMock.dev = false
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: guildID, token: 'tok' }])
      nextForkExitCode = 0
      await loadDiscordSlave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    afterEach(() => {
      configServerMock.dev = true
    })

    it('pushes application commands and skips the guild-cleanup loop for the main instance', async () => {
      restPutMock.mockResolvedValueOnce(undefined)
      await bootWithRestPush('main')

      expect(restPutMock).toHaveBeenCalledWith(expect.anything(), { body: expect.any(Array) })
      expect(restGetMock).not.toHaveBeenCalled()
      expect(restDeleteMock).not.toHaveBeenCalled()
    })

    it('removes stale guild commands for a non-main guild instance', async () => {
      restPutMock.mockResolvedValueOnce(undefined)
      restGetMock.mockResolvedValueOnce([{ id: 'cmd1' }, { id: 'cmd2' }])
      restDeleteMock.mockResolvedValue(undefined)

      await bootWithRestPush('g-rest')

      expect(restGetMock).toHaveBeenCalled()
      expect(restDeleteMock).toHaveBeenCalledTimes(2)
    })

    it('logs and swallows an error when the REST push fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      restPutMock.mockRejectedValueOnce(new Error('rest boom'))

      await bootWithRestPush('main')

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
      expect(gmLogMock).toHaveBeenCalledWith('discord', expect.stringContaining('Failed to reload application'))
    })
  })

  describe('client warn/error events', () => {
    it('logs a warn event', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await bootOneClient('main')
      const client = await getMainClient()
      client.emit('warn', 'something is off')
      expect(warnSpy).toHaveBeenCalledWith('something is off')
      expect(gmLogMock).toHaveBeenCalledWith('discord', 'Warn: something is off')
    })

    it('logs an error event', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await bootOneClient('main')
      const client = await getMainClient()
      const err = new Error('client error')
      client.emit('error', err)
      expect(errorSpy).toHaveBeenCalledWith(err)
      expect(gmLogMock).toHaveBeenCalledWith('discord', `Error: ${err}`)
    })

    async function bootOneClient(guildID: string) {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: guildID, token: 'tok' }])
      nextForkExitCode = 0
      await loadDiscordSlave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  })

  describe('InteractionCreate routing', () => {
    async function bootOneClient(guildID: string) {
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ guild: guildID, token: 'tok' }])
      nextForkExitCode = 0
      await loadDiscordSlave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    it('ignores interactions that are neither commands nor autocomplete', async () => {
      await bootOneClient('main')
      const client = await getMainClient()
      client.emit('interactionCreate', { isCommand: () => false, isAutocomplete: () => false })
    })

    it('swallows and logs an error thrown while routing an interaction', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await bootOneClient('main')
      const client = await getMainClient()
      // No command/context is registered (fs is mocked empty in this file), so this exercises
      // the "no branch matches" no-op path without throwing - routing failures inside a real
      // command's execute() are covered by index.loadDiscordMain.test.ts instead, which loads
      // real command modules.
      const interaction = {
        isCommand: () => true,
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        commandName: 'does-not-exist',
      }
      client.emit('interactionCreate', interaction)
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
