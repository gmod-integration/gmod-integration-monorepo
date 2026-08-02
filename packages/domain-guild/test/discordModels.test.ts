import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { clientID: 'client1', clientSecret: 'secret1', botToken: 'bot-token' },
}))
vi.mock('@gmod/core/utils/tools.js', () => ({ generateToken: vi.fn(() => 'generated-token') }))
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('uuid', () => ({ v4: vi.fn(() => 'uuid-1') }))

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
  gm_discordToken: { findFirst: vi.fn(), delete: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  gm_panelToken: { create: vi.fn() },
  gm_user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

function resetAllMocks() {
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

// This module registers a `setInterval` at import time - use fake timers before importing so
// that real 30s interval never actually schedules against the real clock during the test run.
vi.useFakeTimers()

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

// Fake timers stay active for the whole file so the module-level setInterval registered above
// (under this same fake clock) can still be advanced by the dedicated interval test at the end -
// switching to real timers and back would create a new clock that doesn't know about it.
afterAll(() => {
  vi.useRealTimers()
})

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
      const server = { getSetting: vi.fn().mockResolvedValueOnce('gmod-to-discord'), getSyncRoles: vi.fn() }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const member = { guild: { id: 'g1' }, id: 'u1', roles: { cache: makeRoleCollection([]) } }

      await updateRolesToGmod(member as any, member as any, member as any)

      expect(server.getSyncRoles).not.toHaveBeenCalled()
    })

    it('skips servers with no sync roles configured', async () => {
      const server = {
        id: 's1',
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce([]),
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
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        expect.objectContaining({ data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', group: 'vip', add: true }) }),
      )
    })

    it('adds the mapped in-game group without touching other roles when there is nothing to remove', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        expect.objectContaining({ data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', group: 'vip', add: true }) }),
      )
    })

    it('skips an added role already recorded in redis addIDs', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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

    it('removes the mapped in-game group when a synced role is removed (roleID not pending in addIDs)', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        expect.objectContaining({ data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', group: 'vip', add: false }) }),
      )
    })

    it('clears the pending addIDs entry when the removed role was queued to be added', async () => {
      const syncRoles = [{ roleID: 'r1', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getID: () => 's1',
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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

    it('does nothing when no synced role remains and there is no default "user" role', async () => {
      const syncRoles = [{ roleID: 'r-vip', enable: true, userGroup: 'vip' }]
      const server = {
        id: 's1',
        getSetting: vi.fn().mockResolvedValueOnce('both'),
        getSyncRoles: vi.fn().mockResolvedValueOnce(syncRoles),
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
    it('getUserTokenFromCode returns the parsed token on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) }))
      await expect(getUserTokenFromCode('code1', 'https://redirect')).resolves.toEqual({ access_token: 'tok' })
    })

    it('getUserTokenFromCode returns null and logs on failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad request' }),
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(getUserTokenFromCode('code1', 'https://redirect')).resolves.toBeNull()
      expect(errorSpy).toHaveBeenCalled()
    })

    it('getUserTokenFromCode returns null when reading the error body itself fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: vi.fn().mockRejectedValueOnce(new Error('stream error')),
        }),
      )
      await expect(getUserTokenFromCode('code1', 'https://redirect')).resolves.toBeNull()
    })

    it('getUserTokenFromRefreshToken returns the parsed token on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) }))
      await expect(getUserTokenFromRefreshToken('refresh1')).resolves.toEqual({ access_token: 'tok' })
    })

    it('getUserTokenFromRefreshToken returns null on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }))
      await expect(getUserTokenFromRefreshToken('refresh1')).resolves.toBeNull()
    })

    it('getUserFromToken returns the parsed user on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'u1' }) }))
      await expect(getUserFromToken('tok1')).resolves.toEqual({ id: 'u1' })
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
    it('returns null when there is no stored discord token', async () => {
      prismaMock.gm_discordToken.findFirst.mockResolvedValueOnce(null)
      await expect(refreshUserToken('u1')).resolves.toBeNull()
    })

    it('deletes the stored token and returns null when refreshing fails', async () => {
      prismaMock.gm_discordToken.findFirst.mockResolvedValueOnce({ refreshToken: 'r1' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }))

      await expect(refreshUserToken('u1')).resolves.toBeNull()
      expect(prismaMock.gm_discordToken.delete).toHaveBeenCalledWith({ where: { discordID: 'u1' } })
    })

    it('updates and returns the refreshed token on success', async () => {
      prismaMock.gm_discordToken.findFirst.mockResolvedValueOnce({ refreshToken: 'r1' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        }),
      )

      const result = await refreshUserToken('u1')

      expect(result).toEqual({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 })
      expect(prismaMock.gm_discordToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { discordID: 'u1' } }),
      )
    })
  })

  describe('saveUser', () => {
    it('creates a new user row when none exists', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce(null)
      await expect(saveUser('u1', 'Name')).resolves.toBe(true)
      expect(prismaMock.gm_user.create).toHaveBeenCalledWith({ data: { id: 'u1', username: 'Name' } })
    })

    it('updates the existing user row', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'u1' })
      await expect(saveUser('u1', 'Name')).resolves.toBe(true)
      expect(prismaMock.gm_user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { username: 'Name' } })
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

    it('creates a new discord token row when none exists', async () => {
      prismaMock.gm_discordToken.findFirst.mockResolvedValueOnce(null)

      const token = await saveUserPanel('u1', discordUserToken, sessionData)

      expect(prismaMock.gm_discordToken.create).toHaveBeenCalled()
      expect(prismaMock.gm_panelToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discordID: 'u1', accessToken: 'generated-token' }) }),
      )
      expect(token).toBe('generated-token')
    })

    it('updates the existing discord token row', async () => {
      prismaMock.gm_discordToken.findFirst.mockResolvedValueOnce({ discordID: 'u1' })

      await saveUserPanel('u1', discordUserToken, sessionData)

      expect(prismaMock.gm_discordToken.update).toHaveBeenCalled()
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
      const server = { id: 's1', getID: () => 's1', getSetting: vi.fn().mockResolvedValueOnce('gmod-to-discord') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const member = { guild: { id: 'g1' }, id: 'u1' }
      await updatePseudoToGmod(member as any, member as any, { nickname: 'nick', user: { username: 'user1' } } as any)
      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('returns early when the nickname is unchanged from the last synced value', async () => {
      const server = { id: 's1', getID: () => 's1', getSetting: vi.fn().mockResolvedValueOnce('both') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce('nick')
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: 'nick', user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).not.toHaveBeenCalled()
    })

    it('continues (does not return early) when the sync direction is exactly discord-to-gmod', async () => {
      const server = { id: 's1', getID: () => 's1', getSetting: vi.fn().mockResolvedValueOnce('discord-to-gmod') }
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      redisMock.get.mockResolvedValueOnce(null)
      const member = { guild: { id: 'g1' }, id: 'u1' }
      const newMember = { nickname: 'nick', user: { username: 'user1' } }
      await updatePseudoToGmod(member as any, member as any, newMember as any)
      expect(wsAddMock).toHaveBeenCalled()
    })

    it('pushes a wsSyncName update using the nickname when set', async () => {
      const server = { id: 's1', getID: () => 's1', getSetting: vi.fn().mockResolvedValueOnce('both') }
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
      const server = { id: 's1', getID: () => 's1', getSetting: vi.fn().mockResolvedValueOnce('both') }
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
      const server = { id: 's1', getID: () => 's1', getSetting: vi.fn().mockResolvedValueOnce('both') }
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

  describe('token-refresh interval', () => {
    it('refreshes every token nearing expiration', async () => {
      prismaMock.gm_discordToken.findMany.mockResolvedValueOnce([{ discordID: 'u1', refreshToken: 'r1' }])
      prismaMock.gm_discordToken.findFirst.mockResolvedValueOnce({ refreshToken: 'r1' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
        }),
      )

      await vi.advanceTimersByTimeAsync(30_000)

      expect(prismaMock.gm_discordToken.findMany).toHaveBeenCalled()
    })
  })
})
