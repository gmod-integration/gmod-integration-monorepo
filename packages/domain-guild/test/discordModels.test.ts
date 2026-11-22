import type * as NodeCrypto from 'node:crypto'
import type * as DomainAccess from '@gmod/domain-access/index.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const oauth = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  exchangeRefresh: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
  createSession: vi.fn(),
}))
vi.mock('@gmod/domain-auth/discordOAuth.js', () => ({
  DiscordOAuthError: class extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  exchangeDiscordCode: oauth.exchangeCode,
  exchangeDiscordRefreshToken: oauth.exchangeRefresh,
  refreshDiscordCredentials: oauth.refresh,
  saveDiscordCredentials: oauth.save,
}))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({ createApplicationSession: oauth.createSession }))
import { DiscordOAuthError } from '@gmod/domain-auth/discordOAuth.js'

const accessMock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof DomainAccess>()),
  resolveGuildAccess: accessMock,
}))
const freeAccess = () => ({
  guildID: 'g1',
  premium: false,
  customBot: false,
  state: 'ready' as const,
  sources: [],
  revision: 'rev',
  validUntil: '2030-01-01T00:00:00.000Z',
})

const assertPersonalDataAllowedMock = vi.fn().mockResolvedValue(undefined)
const isErasureBlockedMock = vi.fn().mockResolvedValue(false)
const getRetainedTrustMock = vi.fn().mockResolvedValue(null)
const prepareExplicitOAuthLoginMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/domain-user/privacy.js', () => ({
  assertPersonalDataAllowed: assertPersonalDataAllowedMock,
  isErasureBlocked: isErasureBlockedMock,
  getRetainedTrust: getRetainedTrustMock,
  prepareExplicitOAuthLogin: prepareExplicitOAuthLoginMock,
  PersonalDataErasureError: class extends Error {
    constructor() {
      super('Personal data collection is disabled')
    }
  },
}))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { clientID: 'client1', clientSecret: 'secret1', botToken: 'bot-token' },
}))
vi.mock('@gmod/shared/generateToken.js', () => ({ generateToken: vi.fn(() => 'generated-token') }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeCrypto>()),
  randomUUID: vi.fn(() => 'uuid-1'),
}))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock }))

const isGuildPremiumMock = vi.fn()
vi.mock('../src/Guild.js', () => ({ isGuildPremium: isGuildPremiumMock }))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const wsAddMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: wsAddMock } }))

const ensureAvatarStoredMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock }))

const enqueueMainClientFetchUserMock = vi.fn()
const enqueueMainClientSyncPremiumRolesMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueMainClientFetchUser: enqueueMainClientFetchUserMock,
  enqueueMainClientSyncPremiumRoles: enqueueMainClientSyncPremiumRolesMock,
}))

const prismaMock: any = {
  gm_guild: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  gm_guild_auto_roles: { findMany: vi.fn(), delete: vi.fn() },
  gm_guild_verify_role: { findMany: vi.fn(), delete: vi.fn() },
  gm_discordToken: {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
  gm_panelToken: { deleteMany: vi.fn(), create: vi.fn() },
  gm_user: { deleteMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

function resetAllMocks() {
  oauth.exchangeCode.mockReset()
  oauth.exchangeRefresh.mockReset()
  oauth.refresh.mockReset()
  oauth.save.mockReset().mockResolvedValue({ version: 1, refreshToken: 'encrypted-refresh' })
  oauth.createSession.mockReset().mockResolvedValue({ token: 'new-session-token', session: { id: 'session-1' } })
  accessMock.mockReset().mockResolvedValue({ ...freeAccess(), premium: true })
  assertPersonalDataAllowedMock.mockReset().mockResolvedValue(undefined)
  isErasureBlockedMock.mockReset().mockResolvedValue(false)
  getRetainedTrustMock.mockReset().mockResolvedValue(null)
  prepareExplicitOAuthLoginMock.mockReset().mockResolvedValue(undefined)
  getUserFromDiscordIDMock.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
  isGuildPremiumMock.mockReset()
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  wsAddMock.mockReset()
  ensureAvatarStoredMock.mockReset()
  enqueueMainClientFetchUserMock.mockReset()
  enqueueMainClientSyncPremiumRolesMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  vi.stubGlobal('fetch', vi.fn())
}

const {
  updateRolesToGmod,
  updateGuildStat,
  addAutoRoleToUser,
  addVerifyRoleToUser,
  verifyUser,
  getUserGuildsWithPermsForPanel,
  getUserTokenFromCode,
  getUserTokenFromRefreshToken,
  refreshUserToken,
  getUserFromToken,
  saveUser,
  saveUserPanel,
  addUserToGuild,
  getDiscordUserFromID,
  updatePseudoToGmod,
  givePremiumRoleOfMainGuild,
} = await import('../src/discordModels.js')

describe('discordModels', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updateRolesToGmod', () => {
    // Minimal stand-in for discord.js's Collection (extends Map, but also exposes an
    // array-style .map() over values) - the source uses both Map iteration (for..of yielding
    // [id, role] pairs) and .map()/.size, so a plain Map alone is not enough here.
    class FakeCollection extends Map<string, any> {
      filter(fn: (role: any) => boolean): FakeCollection {
        return new FakeCollection([...this.entries()].filter(([, role]) => fn(role)))
      }
      map<T>(fn: (role: any) => T): T[] {
        return [...this.values()].map(fn)
      }
    }
    function makeRoleCollection(entries: Array<[string, any]>) {
      return new FakeCollection(entries)
    }

    it('returns early when the guild has no servers', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: makeRoleCollection([]) } }
      await updateRolesToGmod(member as any, member as any, member as any)
      expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
    })

    it('returns early when the DB user has no linked steam account', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ id: 's1' }])
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: makeRoleCollection([]) } }
      await updateRolesToGmod(member as any, member as any, member as any)
      expect(getServersFromDiscordGuildIDMock).toHaveBeenCalled()
    })

    it('skips servers whose sync direction excludes discord-to-gmod', async () => {
      const server = {
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('gmod-to-discord'),
        getEffectiveSyncRoles: vi.fn(),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: makeRoleCollection([]) } }

      await updateRolesToGmod(member as any, member as any, member as any)

      expect(server.getEffectiveSyncRoles).not.toHaveBeenCalled()
    })

    it('skips servers with no sync roles configured', async () => {
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce([]),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: makeRoleCollection([]) } }

      await updateRolesToGmod(member as any, member as any, member as any)

      expect(redisMock.get).not.toHaveBeenCalled()
    })

    it('adds the mapped in-game group and removes conflicting synced roles when a new synced role is added', async () => {
      const syncRoles = [
        { roleID: 'r1', enable: true, userGroup: 'vip' },
        { roleID: 'r0', enable: true, userGroup: 'basic' },
      ]
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)

      const rolesRemove = vi.fn().mockResolvedValueOnce(undefined)
      const rolesAdd = vi.fn().mockResolvedValueOnce(undefined)
      // The member already has the old synced role (r0) and now also has the newly added one (r1).
      const currentCache = makeRoleCollection([
        ['r0', { id: 'r0' }],
        ['r1', { id: 'r1' }],
      ])
      const oldRolesCache = makeRoleCollection([['r0', { id: 'r0' }]])
      const newRolesCache = currentCache
      const member = {
        guild: { id: 'g1' },
        id: 'u1',
        roles: { cache: currentCache, remove: rolesRemove, add: rolesAdd },
      }
      const oldMember = { roles: { cache: oldRolesCache } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(rolesRemove).toHaveBeenCalled()
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({
          data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', group: 'vip', add: true }),
        }),
      )
    })

    it('adds the mapped in-game group without touching other roles when there is nothing to remove', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)

      const rolesRemove = vi.fn()
      const rolesAdd = vi.fn()
      const oldRolesCache = makeRoleCollection([])
      const newRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const member = {
        guild: { id: 'g1' },
        id: 'u1',
        roles: { cache: newRolesCache, remove: rolesRemove, add: rolesAdd },
      }
      const oldMember = { roles: { cache: oldRolesCache } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(rolesRemove).not.toHaveBeenCalled()
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({
          data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', group: 'vip', add: true }),
        }),
      )
    })

    it('skips an added role already recorded in redis addIDs', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(JSON.stringify({ addIDs: ['r1'], removeIDs: [] }))

      const newRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRolesCache } }
      const oldMember = { roles: { cache: makeRoleCollection([]) } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('skips an added role that has no matching or disabled sync entry', async () => {
      const syncRoles = [{ roleID: 'r1', enable: false, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)

      const newRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRolesCache } }
      const oldMember = { roles: { cache: makeRoleCollection([]) } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it.each(['unmapped', 'disabled'])(
      'ignores added and removed %s roles while an enabled mapping remains held',
      async (kind) => {
        const server = {
          id: 's1',
          getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
          getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce([
            { roleID: 'kept', enable: true, userGroup: 'vip' },
            { roleID: 'disabled-added', enable: false, userGroup: 'admin' },
            { roleID: 'disabled-removed', enable: false, userGroup: 'admin' },
          ]),
        }
        getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
        getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
        redisMock.get.mockResolvedValueOnce(null)
        const kept = ['kept', { id: 'kept' }] as [string, { id: string }]
        const oldRoles = makeRoleCollection([kept, [`${kind}-removed`, { id: `${kind}-removed` }]])
        const newRoles = makeRoleCollection([kept, [`${kind}-added`, { id: `${kind}-added` }]])
        const add = vi.fn()
        const remove = vi.fn()
        const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRoles, add, remove } }
        await updateRolesToGmod(
          member as any,
          { roles: { cache: oldRoles } } as any,
          { roles: { cache: newRoles } } as any,
        )
        expect(wsAddMock).not.toHaveBeenCalled()
        expect(add).not.toHaveBeenCalled()
        expect(remove).not.toHaveBeenCalled()
        expect(redisMock.set).not.toHaveBeenCalled()
      },
    )

    it('removes the mapped in-game group when a synced role is removed (roleID not pending in addIDs)', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(JSON.stringify({ addIDs: [], removeIDs: [] }))

      const oldRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const newRolesCache = makeRoleCollection([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRolesCache } }
      const oldMember = { roles: { cache: oldRolesCache } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({
          data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', group: 'vip', add: false }),
        }),
      )
    })

    it('clears the pending addIDs entry when the removed role was queued to be added', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(JSON.stringify({ addIDs: ['r1'], removeIDs: [] }))

      const oldRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const newRolesCache = makeRoleCollection([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRolesCache } }
      const oldMember = { roles: { cache: oldRolesCache } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('sync-role:gmod:server:s1'),
        expect.stringContaining('"addIDs":[]'),
        'EX',
        120,
      )
    })

    it('skips a removed role already recorded in redis removeIDs', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(JSON.stringify({ addIDs: [], removeIDs: ['r1'] }))

      const oldRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const newRolesCache = makeRoleCollection([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRolesCache } }
      const oldMember = { roles: { cache: oldRolesCache } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('skips a removed role that has no matching or disabled sync entry', async () => {
      const syncRoles = [{ roleID: 'r1', enable: false, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)

      const oldRolesCache = makeRoleCollection([['r1', { id: 'r1' }]])
      const newRolesCache = makeRoleCollection([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: newRolesCache } }
      const oldMember = { roles: { cache: oldRolesCache } }
      const newMember = { roles: { cache: newRolesCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('assigns the default "user" sync role when no synced role remains', async () => {
      const syncRoles = [{ roleID: 'r-user', enable: true, userGroup: 'user' }]
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)

      const rolesAdd = vi.fn().mockResolvedValueOnce(undefined)
      const emptyCache = makeRoleCollection([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: emptyCache, add: rolesAdd } }
      const oldMember = { roles: { cache: emptyCache } }
      const newMember = { roles: { cache: emptyCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(rolesAdd).toHaveBeenCalledWith('r-user')
    })

    it('does not grant or synchronize a disabled default user mapping', async () => {
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi
          .fn()
          .mockResolvedValueOnce([{ roleID: 'disabled-user', enable: false, userGroup: 'user' }]),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const rolesAdd = vi.fn()
      const rolesRemove = vi.fn()
      const member = {
        guild: { id: 'g1' },
        id: 'u1',
        roles: { cache: makeRoleCollection([]), add: rolesAdd, remove: rolesRemove },
      }

      await updateRolesToGmod(member as any, member as any, member as any)

      expect(rolesAdd).not.toHaveBeenCalled()
      expect(rolesRemove).not.toHaveBeenCalled()
      expect(wsAddMock).not.toHaveBeenCalled()
      expect(redisMock.get).not.toHaveBeenCalled()
      expect(redisMock.set).not.toHaveBeenCalled()
    })

    it('selects the enabled default even when a disabled user mapping comes first', async () => {
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce([
          { roleID: 'disabled-user', enable: false, userGroup: 'user' },
          { roleID: 'enabled-user', enable: true, userGroup: 'user' },
        ]),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const rolesAdd = vi.fn()
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: makeRoleCollection([]), add: rolesAdd } }

      await updateRolesToGmod(member as any, member as any, member as any)

      expect(rolesAdd).toHaveBeenCalledExactlyOnceWith('enabled-user')
      expect(wsAddMock).not.toHaveBeenCalled()
      const cached = JSON.parse(redisMock.set.mock.calls[0][1])
      expect(cached.addIDs).toEqual(['enabled-user'])
    })

    it('does not let a held disabled mapping suppress the enabled fallback', async () => {
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('discord-to-gmod'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce([
          { roleID: 'disabled-vip', enable: false, userGroup: 'vip' },
          { roleID: 'enabled-user', enable: true, userGroup: 'user' },
        ]),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const rolesAdd = vi.fn()
      const rolesRemove = vi.fn()
      const member = {
        guild: { id: 'g1' },
        id: 'u1',
        roles: {
          cache: makeRoleCollection([['disabled-vip', { id: 'disabled-vip' }]]),
          add: rolesAdd,
          remove: rolesRemove,
        },
      }

      await updateRolesToGmod(member as any, member as any, member as any)

      expect(rolesAdd).toHaveBeenCalledExactlyOnceWith('enabled-user')
      expect(rolesRemove).not.toHaveBeenCalled()
      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('does nothing when no synced role remains and there is no default "user" role', async () => {
      const syncRoles = [{ roleID: 'r-vip', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('both'),
        getEffectiveSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)

      const rolesAdd = vi.fn()
      const emptyCache = makeRoleCollection([])
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: emptyCache, add: rolesAdd } }
      const oldMember = { roles: { cache: emptyCache } }
      const newMember = { roles: { cache: emptyCache } }

      await updateRolesToGmod(member as any, oldMember as any, newMember as any)

      expect(rolesAdd).not.toHaveBeenCalled()
    })
  })

  describe('updateGuildStat', () => {
    it('creates a gm_guild row when none exists', async () => {
      prismaMock.gm_guild.findUnique.mockResolvedValueOnce(null)
      const guild = { id: 'g1', name: 'My Guild', memberCount: 10, preferredLocale: 'en-US' }

      await updateGuildStat(guild as any)

      expect(prismaMock.gm_guild.create).toHaveBeenCalledWith({
        data: { guild: 'g1', name: 'My Guild', member: 10, language: 'en-US' },
      })
    })

    it('updates the existing gm_guild row', async () => {
      prismaMock.gm_guild.findUnique.mockResolvedValueOnce({ guild: 'g1' })
      const guild = { id: 'g1', name: 'My Guild', memberCount: 12, preferredLocale: 'en-US' }

      await updateGuildStat(guild as any)

      expect(prismaMock.gm_guild.update).toHaveBeenCalledWith({
        where: { guild: 'g1' },
        data: expect.objectContaining({ member: 12, name: 'My Guild', language: 'en-US' }),
      })
    })
  })

  describe('addAutoRoleToUser', () => {
    it('returns true when there are no auto-role rows', async () => {
      prismaMock.gm_guild_auto_roles.findMany.mockResolvedValueOnce([])
      const guild = { id: 'g1', roles: { cache: new Map() } }
      const member = { roles: { cache: { has: () => false }, add: vi.fn() } }

      await expect(addAutoRoleToUser(guild as any, member as any)).resolves.toBe(true)
    })

    it('deletes stale auto-role rows whose Discord role no longer exists', async () => {
      prismaMock.gm_guild_auto_roles.findMany.mockResolvedValueOnce([{ roleID: 'r1' }])
      const guild = { id: 'g1', roles: { cache: new Map() } }
      const member = { roles: { cache: { has: () => false }, add: vi.fn() } }

      await addAutoRoleToUser(guild as any, member as any)

      expect(prismaMock.gm_guild_auto_roles.delete).toHaveBeenCalledWith({ where: { roleID: 'r1', guildID: 'g1' } })
    })

    it('skips a member who already has the role', async () => {
      prismaMock.gm_guild_auto_roles.findMany.mockResolvedValueOnce([{ roleID: 'r1' }])
      const guild = { id: 'g1', roles: { cache: new Map([['r1', { id: 'r1' }]]) } }
      const rolesAdd = vi.fn()
      const member = { roles: { cache: { has: () => true }, add: rolesAdd } }

      await addAutoRoleToUser(guild as any, member as any)

      expect(rolesAdd).not.toHaveBeenCalled()
    })

    it('adds the role when the member does not already have it', async () => {
      prismaMock.gm_guild_auto_roles.findMany.mockResolvedValueOnce([{ roleID: 'r1' }])
      const roleDiscord = { id: 'r1' }
      const guild = { id: 'g1', roles: { cache: new Map([['r1', roleDiscord]]) } }
      const rolesAdd = vi.fn().mockResolvedValueOnce(undefined)
      const member = { roles: { cache: { has: () => false }, add: rolesAdd } }

      await addAutoRoleToUser(guild as any, member as any)

      expect(rolesAdd).toHaveBeenCalledWith(roleDiscord)
    })
  })

  it('suspends excess autoroles after expiry without deleting their saved configuration', async () => {
    accessMock.mockResolvedValueOnce(freeAccess())
    const rows = Array.from({ length: 4 }, (_, index) => ({ roleID: `r${index}` }))
    prismaMock.gm_guild_auto_roles.findMany.mockResolvedValueOnce(rows)
    const guild = { id: 'g1', roles: { cache: new Map(rows.map((row) => [row.roleID, { id: row.roleID }])) } }
    const add = vi.fn()
    await addAutoRoleToUser(guild as any, { roles: { cache: { has: () => false }, add } } as any)
    expect(add.mock.calls.map(([role]) => role.id)).toEqual(['r0', 'r1', 'r2'])
    expect(prismaMock.gm_guild_auto_roles.delete).not.toHaveBeenCalled()
    expect(prismaMock.gm_guild_auto_roles.findMany).toHaveBeenCalledWith({
      where: { guildID: 'g1' },
      orderBy: [{ createdAt: 'asc' }, { roleID: 'asc' }],
    })
  })

  it('uses only the free verification role quota after expiry while retaining additional rules', async () => {
    accessMock.mockResolvedValueOnce(freeAccess())
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      roleID: `r${index}`,
      enabled: true,
      isGiveRole: true,
    }))
    prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce(rows)
    const guild = { id: 'g1', roles: { cache: new Map(rows.map((row) => [row.roleID, { id: row.roleID }])) } }
    const add = vi.fn()
    await addVerifyRoleToUser(guild as any, { roles: { cache: { has: () => false }, add } } as any)
    expect(add.mock.calls.map(([role]) => role.id)).toEqual(['r0', 'r1'])
    expect(prismaMock.gm_guild_verify_role.delete).not.toHaveBeenCalled()
  })

  describe('addVerifyRoleToUser', () => {
    it('returns undefined when there are no verify-role rows', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([])
      const guild = { id: 'g1', roles: { cache: new Map() } }
      const member = { roles: { cache: { has: () => false }, add: vi.fn(), remove: vi.fn() } }

      await expect(addVerifyRoleToUser(guild as any, member as any)).resolves.toBeUndefined()
    })

    it('deletes stale verify-role rows whose Discord role no longer exists', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([{ id: 1, roleID: 'r1' }])
      const guild = { id: 'g1', roles: { cache: new Map() } }
      const member = { roles: { cache: { has: () => false }, add: vi.fn(), remove: vi.fn() } }

      await addVerifyRoleToUser(guild as any, member as any)

      expect(prismaMock.gm_guild_verify_role.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('skips a disabled verify-role row', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([{ id: 1, roleID: 'r1', enabled: false }])
      const roleDiscord = { id: 'r1' }
      const guild = { id: 'g1', roles: { cache: new Map([['r1', roleDiscord]]) } }
      const rolesAdd = vi.fn()
      const member = { roles: { cache: { has: () => false }, add: rolesAdd, remove: vi.fn() } }

      await addVerifyRoleToUser(guild as any, member as any)

      expect(rolesAdd).not.toHaveBeenCalled()
    })

    it('gives the role when isGiveRole and the member does not have it yet', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([
        { id: 1, roleID: 'r1', enabled: true, isGiveRole: true },
      ])
      const roleDiscord = { id: 'r1' }
      const guild = { id: 'g1', roles: { cache: new Map([['r1', roleDiscord]]) } }
      const rolesAdd = vi.fn().mockResolvedValueOnce(undefined)
      const member = { roles: { cache: { has: () => false }, add: rolesAdd, remove: vi.fn() } }

      await addVerifyRoleToUser(guild as any, member as any)

      expect(rolesAdd).toHaveBeenCalledWith(roleDiscord)
    })

    it('skips giving the role when the member already has it', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([
        { id: 1, roleID: 'r1', enabled: true, isGiveRole: true },
      ])
      const roleDiscord = { id: 'r1' }
      const guild = { id: 'g1', roles: { cache: new Map([['r1', roleDiscord]]) } }
      const rolesAdd = vi.fn()
      const member = { roles: { cache: { has: () => true }, add: rolesAdd, remove: vi.fn() } }

      await addVerifyRoleToUser(guild as any, member as any)

      expect(rolesAdd).not.toHaveBeenCalled()
    })

    it('removes the role when not isGiveRole and the member has it', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([
        { id: 1, roleID: 'r1', enabled: true, isGiveRole: false },
      ])
      const roleDiscord = { id: 'r1' }
      const guild = { id: 'g1', roles: { cache: new Map([['r1', roleDiscord]]) } }
      const rolesRemove = vi.fn().mockResolvedValueOnce(undefined)
      const member = { roles: { cache: { has: () => true }, add: vi.fn(), remove: rolesRemove } }

      await addVerifyRoleToUser(guild as any, member as any)

      expect(rolesRemove).toHaveBeenCalledWith(roleDiscord)
    })

    it('skips removing the role when the member does not have it', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([
        { id: 1, roleID: 'r1', enabled: true, isGiveRole: false },
      ])
      const roleDiscord = { id: 'r1' }
      const guild = { id: 'g1', roles: { cache: new Map([['r1', roleDiscord]]) } }
      const rolesRemove = vi.fn()
      const member = { roles: { cache: { has: () => false }, add: vi.fn(), remove: rolesRemove } }

      await addVerifyRoleToUser(guild as any, member as any)

      expect(rolesRemove).not.toHaveBeenCalled()
    })
  })

  describe('verifyUser', () => {
    it('returns false when the DB user has no linked steam account', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const guild = { id: 'g1' }
      const member = { id: 'u1' }
      await expect(verifyUser(guild as any, member as any)).resolves.toBe(false)
    })

    it('adds the verify role and returns true when linked', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([])
      const guild = { id: 'g1' }
      const member = { id: 'u1' }
      await expect(verifyUser(guild as any, member as any)).resolves.toBe(true)
    })
  })

  describe('getUserGuildsWithPermsForPanel', () => {
    it('builds the guild list with hasBot/isPremium/isOwner flags', async () => {
      const panelUser = {
        findGuildsWithPerms: vi.fn().mockResolvedValueOnce([
          { id: 'g1', name: 'Guild One', icon: 'icon1', owner: true },
          { id: 'g2', name: 'Guild Two', icon: null, owner: false },
        ]),
      }
      prismaMock.gm_guild.findMany.mockResolvedValueOnce([{ guild: 'g1' }])
      ensureAvatarStoredMock.mockResolvedValueOnce('stored-icon-1').mockResolvedValueOnce('stored-icon-2')
      isGuildPremiumMock.mockResolvedValueOnce(true)

      const result = await getUserGuildsWithPermsForPanel(panelUser as any)

      expect(result).toEqual([
        { id: 'g1', name: 'Guild One', icon: 'stored-icon-1', hasBot: true, isOwner: true, isPremium: true },
        { id: 'g2', name: 'Guild Two', icon: 'stored-icon-2', hasBot: false, isOwner: false, isPremium: false },
      ])
    })

    it('marks a guild without the bot as not premium without querying premium status', async () => {
      const panelUser = {
        findGuildsWithPerms: vi.fn().mockResolvedValueOnce([{ id: 'g1', name: 'Guild One', icon: null, owner: true }]),
      }
      prismaMock.gm_guild.findMany.mockResolvedValueOnce([])
      ensureAvatarStoredMock.mockResolvedValueOnce(null)

      const result = await getUserGuildsWithPermsForPanel(panelUser as any)

      expect(result).toEqual([
        { id: 'g1', name: 'Guild One', icon: null, hasBot: false, isOwner: true, isPremium: false },
      ])
      expect(isGuildPremiumMock).not.toHaveBeenCalled()
    })
  })

  describe('getUserTokenFromCode / getUserTokenFromRefreshToken / getUserFromToken', () => {
    it('delegates the code and PKCE verifier to the shared OAuth service', async () => {
      oauth.exchangeCode.mockResolvedValueOnce({ access_token: 'tok' })
      await expect(getUserTokenFromCode('code1', 'https://redirect', 'verifier')).resolves.toEqual({
        access_token: 'tok',
      })
      expect(oauth.exchangeCode).toHaveBeenCalledWith('code1', 'https://redirect', 'verifier')
    })

    it('returns null for a rejected authorization code', async () => {
      oauth.exchangeCode.mockRejectedValueOnce(new DiscordOAuthError('grant_rejected'))
      await expect(getUserTokenFromCode('code1', 'https://redirect')).resolves.toBeNull()
    })

    it('preserves temporary provider errors instead of turning them into invalid credentials', async () => {
      oauth.exchangeCode.mockRejectedValueOnce(new DiscordOAuthError('provider_unavailable'))
      await expect(getUserTokenFromCode('code1', 'https://redirect')).rejects.toMatchObject({
        code: 'provider_unavailable',
      })
    })

    it('delegates raw refresh exchange while retaining its typed failures', async () => {
      oauth.exchangeRefresh.mockResolvedValueOnce({ access_token: 'tok' })
      await expect(getUserTokenFromRefreshToken('refresh1')).resolves.toEqual({ access_token: 'tok' })
      expect(oauth.exchangeRefresh).toHaveBeenCalledWith('refresh1')
      oauth.exchangeRefresh.mockRejectedValueOnce(new DiscordOAuthError('provider_unavailable'))
      await expect(getUserTokenFromRefreshToken('refresh1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    })

    it('getUserFromToken returns the parsed user on success', async () => {
      const profile = {
        id: '123456789',
        username: 'Alice',
        global_name: 'Alice Display',
        avatar: 'a_hash',
        discriminator: '0',
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => profile }))
      const timeout = vi.spyOn(AbortSignal, 'timeout')
      await expect(getUserFromToken('tok1')).resolves.toEqual(profile)
      expect(timeout).toHaveBeenCalledWith(10_000)
      expect(fetch).toHaveBeenCalledWith('https://discord.com/api/users/@me', {
        signal: expect.any(AbortSignal),
        headers: { authorization: 'tok1' },
      })
    })

    it.each([
      null,
      'profile',
      [],
      {},
      { id: 123, username: 'Alice' },
      { id: '../account', username: 'Alice' },
      { id: '123456789' },
      { id: '123456789', username: '' },
      { id: '123456789', username: '   ' },
      { id: '123456789', username: 'a'.repeat(81) },
    ])('getUserFromToken rejects malformed required profile fields: %j', async (profile) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => profile }))
      await expect(getUserFromToken('tok1')).resolves.toBeNull()
    })

    it.each([
      [
        { id: '123456789', username: 'Alice' },
        { id: '123456789', username: 'Alice' },
      ],
      [
        { id: '123456789', username: 'Alice', global_name: null, avatar: null },
        { id: '123456789', username: 'Alice', global_name: null, avatar: null },
      ],
      [
        { id: '123456789', username: 'Alice', global_name: {}, avatar: '../unsafe', discriminator: false },
        { id: '123456789', username: 'Alice' },
      ],
    ])('getUserFromToken only uses valid optional decoration: %j', async (profile, expected) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => profile }))
      await expect(getUserFromToken('tok1')).resolves.toEqual(expected)
    })

    it('getUserFromToken exposes network and malformed JSON failures as provider unavailability', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockRejectedValueOnce(new Error('network'))
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockRejectedValueOnce(new Error('malformed JSON')),
          }),
      )
      await expect(getUserFromToken('tok1')).rejects.toMatchObject({ code: 'provider_unavailable' })
      await expect(getUserFromToken('tok1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    })

    it('getUserFromToken returns null and logs on failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' }),
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(getUserFromToken('tok1')).resolves.toBeNull()
      expect(errorSpy).toHaveBeenCalled()
    })

    it('getUserFromToken returns null when reading the error body itself fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: vi.fn().mockRejectedValueOnce(new Error('stream error')),
        }),
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(getUserFromToken('tok1')).resolves.toBeNull()
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('refreshUserToken', () => {
    it('delegates account rotations to the shared coordinator', async () => {
      oauth.refresh.mockResolvedValueOnce({ access_token: 'new' })
      await expect(refreshUserToken('u1')).resolves.toEqual({ access_token: 'new' })
      expect(oauth.refresh).toHaveBeenCalledWith('u1')
      expect(prismaMock.gm_discordToken.delete).not.toHaveBeenCalled()
    })
    it('does not turn a transient provider outage into account deletion', async () => {
      oauth.refresh.mockRejectedValueOnce(new DiscordOAuthError('provider_unavailable'))
      await expect(refreshUserToken('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
      expect(prismaMock.gm_discordToken.delete).not.toHaveBeenCalled()
    })
  })

  describe('saveUser', () => {
    it('does not recreate a profile while data collection is suppressed', async () => {
      assertPersonalDataAllowedMock.mockRejectedValueOnce(new Error('erasure active'))
      await expect(saveUser('u1', 'Name')).rejects.toThrow('erasure active')
      expect(prismaMock.gm_user.create).not.toHaveBeenCalled()
      expect(prismaMock.gm_user.update).not.toHaveBeenCalled()
    })

    it('restores a retained reputation of zero for a returning user', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce(null)
      getRetainedTrustMock.mockResolvedValueOnce(0)
      await saveUser('u1', 'Name')
      expect(prismaMock.gm_user.create).toHaveBeenCalledWith({ data: { id: 'u1', username: 'Name', trust: 0 } })
    })
    it('creates a new user row when none exists', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce(null)
      await expect(saveUser('u1', 'Name')).resolves.toBe(true)
      expect(prismaMock.gm_user.create).toHaveBeenCalledWith({ data: { id: 'u1', username: 'Name', trust: 50 } })
    })

    it('updates the existing user row', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      await expect(saveUser('u1', 'Name')).resolves.toBe(true)
      expect(prismaMock.gm_user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { username: 'Name' } })
    })

    it('removes only the profile version written by this login when erasure starts during saving', async () => {
      const updatedAt = new Date('2026-11-21T17:00:00Z')
      prismaMock.gm_user.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_user.create.mockResolvedValueOnce({ id: 'u1', updatedAt })
      isErasureBlockedMock.mockResolvedValueOnce(true)
      await expect(saveUser('u1', 'Name')).rejects.toThrow('Personal data collection is disabled')
      expect(prismaMock.gm_user.deleteMany).toHaveBeenCalledWith({ where: { id: 'u1', updatedAt } })
    })
  })

  describe('saveUserPanel', () => {
    const discordUserToken = {
      access_token: 'a1',
      refresh_token: 'r1',
      creationDate: new Date('2026-01-01'),
      expirationDate: new Date('2026-01-02'),
    }
    const sessionData = { os: 'Linux', ip: '1.2.3.4', browser: 'Firefox', country: 'FR' }

    it('does not create OAuth or panel credentials when explicit reactivation is refused', async () => {
      prepareExplicitOAuthLoginMock.mockRejectedValueOnce(new Error('erasure active'))
      await expect(saveUserPanel('u1', discordUserToken, sessionData)).rejects.toThrow('erasure active')
      expect(prismaMock.gm_panelToken.create).not.toHaveBeenCalled()
      expect(prismaMock.gm_discordToken.create).not.toHaveBeenCalled()
    })

    it('saves OAuth credentials and creates an independent application session', async () => {
      const token = await saveUserPanel('u1', discordUserToken, sessionData)
      expect(oauth.save).toHaveBeenCalledWith('u1', discordUserToken)
      expect(oauth.createSession).toHaveBeenCalledWith('u1', sessionData)
      expect(token).toBe('new-session-token')
      expect(prismaMock.gm_panelToken.create).not.toHaveBeenCalled()
    })
    it('removes only the matching credentials/session if erasure starts during login', async () => {
      isErasureBlockedMock.mockResolvedValueOnce(true)
      await expect(saveUserPanel('u1', discordUserToken, sessionData)).rejects.toThrow(
        'Personal data collection is disabled',
      )
      expect(prismaMock.gm_panelToken.deleteMany).toHaveBeenCalledWith({ where: { id: 'session-1' } })
      expect(prismaMock.gm_discordToken.deleteMany).toHaveBeenCalledWith({
        where: { discordID: 'u1', version: 1, refreshToken: 'encrypted-refresh' },
      })
    })
  })

  describe('addUserToGuild', () => {
    it('returns true when the request succeeds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true }))
      await expect(addUserToGuild('g1', 'u1', 'user-token')).resolves.toBe(true)
    })

    it('returns false when the request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }))
      await expect(addUserToGuild('g1', 'u1', 'user-token')).resolves.toBe(false)
    })
  })

  describe('getDiscordUserFromID', () => {
    it('delegates to the bullmq adapter', async () => {
      enqueueMainClientFetchUserMock.mockResolvedValueOnce({ id: 'u1' })
      await expect(getDiscordUserFromID('u1')).resolves.toEqual({ id: 'u1' })
    })
  })

  describe('updatePseudoToGmod', () => {
    it('returns early when the guild has no servers', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([])
      const member = { guild: { id: 'g1' }, id: 'u1' }
      await updatePseudoToGmod(member as any, member as any, member as any)
      expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
    })

    it('returns early when the DB user has no linked steam account', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ id: 's1' }])
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1' }
      await updatePseudoToGmod(member as any, member as any, member as any)
      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('returns early when the sync direction excludes discord-to-gmod', async () => {
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('gmod-to-discord'),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const member = { guild: { id: 'g1' }, id: 'u1' }
      await updatePseudoToGmod(member as any, member as any, { nickname: 'nick', user: { username: 'user1' } } as any)
      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('continues to eligible servers when another server has nickname synchronization disabled', async () => {
      const disabled = {
        id: 'disabled',
        getID: () => 'disabled',
        getEffectiveSetting: vi.fn().mockResolvedValue('disable'),
      }
      const eligible = {
        id: 'eligible',
        getID: () => 'eligible',
        getEffectiveSetting: vi.fn().mockResolvedValue('discord-to-gmod'),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([disabled, eligible])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1' }
      await updatePseudoToGmod(member as any, member as any, { nickname: 'Nick', user: { username: 'User' } } as any)
      expect(wsAddMock).toHaveBeenCalledExactlyOnceWith('wsSendToServer', {
        id: 'eligible',
        data: { method: 'wsSyncName', steamID64: '765', name: 'Nick' },
      })
    })

    it('returns early when the nickname is unchanged from the last synced value', async () => {
      const server = { id: 's1', getID: () => 's1', getEffectiveSetting: vi.fn().mockResolvedValueOnce('both') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce('nick')
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: 'nick', user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('continues (does not return early) when the sync direction is exactly discord-to-gmod', async () => {
      const server = {
        id: 's1',
        getID: () => 's1',
        getEffectiveSetting: vi.fn().mockResolvedValueOnce('discord-to-gmod'),
      }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: 'nick', user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).toHaveBeenCalled()
    })

    it('pushes a wsSyncName update using the nickname when set', async () => {
      const server = { id: 's1', getID: () => 's1', getEffectiveSetting: vi.fn().mockResolvedValueOnce('both') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: 'nick', user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({ data: expect.objectContaining({ method: 'wsSyncName', name: 'nick' }) }),
      )
    })

    it('pushes an update when the cached value is stale (matches neither nickname nor username)', async () => {
      const server = { id: 's1', getID: () => 's1', getEffectiveSetting: vi.fn().mockResolvedValueOnce('both') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce('old-nick')
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: 'new-nick', user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({ data: expect.objectContaining({ method: 'wsSyncName', name: 'new-nick' }) }),
      )
    })

    it('falls back to the username when there is no nickname', async () => {
      const server = { id: 's1', getID: () => 's1', getEffectiveSetting: vi.fn().mockResolvedValueOnce('both') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: null, user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({ data: expect.objectContaining({ name: 'user1' }) }),
      )
    })
  })

  describe('givePremiumRoleOfMainGuild', () => {
    it('delegates to the bullmq adapter', async () => {
      enqueueMainClientSyncPremiumRolesMock.mockResolvedValueOnce(undefined)
      await givePremiumRoleOfMainGuild()
      expect(enqueueMainClientSyncPremiumRolesMock).toHaveBeenCalled()
    })
  })
})
