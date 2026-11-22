import type * as AccessDomain from '@gmod/domain-access/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listSessionsMock = vi.fn()
const resolveSessionMock = vi.fn()
const revokeSessionMock = vi.fn()
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  listApplicationSessions: listSessionsMock,
  resolveApplicationSession: resolveSessionMock,
  revokeApplicationSession: revokeSessionMock,
}))

const accessMock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessDomain>()),
  resolveGuildAccess: accessMock,
}))
const accessSnapshot = (premium = true) => ({
  guildID: 'g1',
  premium,
  customBot: premium,
  state: 'ready' as const,
  sources: [],
  revision: 'test',
  validUntil: '2030-01-01T00:00:00.000Z',
})

const getUserFromDiscordIDMock = vi.fn()
const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({
  getUserFromDiscordID: getUserFromDiscordIDMock,
  getUserFromSteamID64: getUserFromSteamID64Mock,
}))

const generateTokenMock = vi.fn(() => 'generated-token')
const badArgumentMock = vi.fn()
vi.mock('@gmod/shared/generateToken.js', () => ({ generateToken: generateTokenMock }))
vi.mock('../../../src/utils/tools.js', () => ({ badArgument: badArgumentMock }))

const createServerMock = vi.fn()
const getServerFromIDMock = vi.fn()
const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({
  createServer: createServerMock,
  getServerFromID: getServerFromIDMock,
  getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock,
}))

const enqueueDiscordGuildReloadBotInstanceMock = vi.fn()
const enqueueMainClientHasGuildMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildReloadBotInstance: enqueueDiscordGuildReloadBotInstanceMock,
  enqueueMainClientHasGuild: enqueueMainClientHasGuildMock,
}))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const getLogsByServerMock = vi.fn()
const getTotalLogsByServerMock = vi.fn()
vi.mock('../../../src/database/gm_server_logs.js', () => ({
  getLogsByServer: getLogsByServerMock,
  getTotalLogsByServer: getTotalLogsByServerMock,
}))

const prismaMock: any = {
  gm_panelToken: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  gm_server_sync_chat_filter: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  gm_server_stat: { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  gm_user: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  gm_guild_auto_roles: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  gm_guild: { update: vi.fn(), count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  gm_server: { count: vi.fn() },
  users: { count: vi.fn() },
  gm_gmodstore_purchases: { findFirst: vi.fn(), update: vi.fn() },
  gm_server_pseudo: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  gm_users_notifications: { findFirst: vi.fn(), update: vi.fn() },
  gm_server_warn: { count: vi.fn(), findMany: vi.fn() },
  gm_server_screenshots: { findMany: vi.fn(), count: vi.fn() },
  gm_server_ban: { findMany: vi.fn() },
}
const transactionMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { ...prismaMock, $transaction: transactionMock } }))

const {
  processGetProfile,
  processGetUserSessions,
  processDeleteUserSession,
  processLogOut,
  processCreateNewServer,
  processPutGmodToDiscordFilter,
  processDeleteGmodToDiscordFilter,
  processGetServerPlayers,
  processPutPlayerBypassMaintenance,
  processPostUserStartVerification,
  processPostAutoRoles,
  processDeleteAutoRoles,
  processGetAutoRoles,
  processGetAdminInformations,
  processPostGmodPurchase,
  processDeleteGmodPurchase,
  processDeleteUserGmodPurchase,
  processGetUserGmodStorePurchases,
  processPutServerPseudo,
  processDeleteServerPseudo,
  processPatchUserNotifications,
  processGetServerLogs,
  processGetServerWarns,
  processGetGuildBans,
  processGetScreenshotsList,
  processPostServerLogsTrigger,
  processPutServerLogsTrigger,
  processDeleteServerLogsTrigger,
} = await import('../../../src/models/v3/usersControllerModels.js')

function resetAllMocks() {
  listSessionsMock.mockReset()
  resolveSessionMock.mockReset()
  revokeSessionMock.mockReset()
  getUserFromDiscordIDMock.mockReset()
  getUserFromSteamID64Mock.mockReset()
  generateTokenMock.mockClear()
  badArgumentMock.mockReset().mockReturnValue(false)
  createServerMock.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
  enqueueDiscordGuildReloadBotInstanceMock.mockReset()
  enqueueMainClientHasGuildMock.mockReset()
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  getLogsByServerMock.mockReset()
  getTotalLogsByServerMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

describe('usersControllerModels', () => {
  beforeEach(() => {
    accessMock.mockReset().mockResolvedValue(accessSnapshot())
    resetAllMocks()
    getServerFromIDMock.mockReset().mockResolvedValue({ id: 's1', guild: 'g1' })
    transactionMock.mockReset().mockImplementation((operation) => operation(prismaMock))
    prismaMock.gm_guild.update.mockResolvedValue({})
    prismaMock.gm_server.count.mockResolvedValue(0)
    prismaMock.gm_guild_auto_roles.count.mockResolvedValue(0)
  })

  describe('processGetProfile', () => {
    it('returns 400 when neither steamID64 nor discordID is given', async () => {
      const result = await processGetProfile(undefined, undefined)
      expect(result.status).toBe(400)
    })

    it('returns 404 when discordID is given but no user is found', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await processGetProfile(undefined, 'd1')
      expect(result.status).toBe(404)
    })

    it('returns the user found by discordID', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ id: 'u1' })
      const result = await processGetProfile(undefined, 'd1')
      expect(result).toEqual({ status: 200, body: { id: 'u1' } })
    })

    it('returns 404 when steamID64 is given but no user is found', async () => {
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)
      const result = await processGetProfile('765', undefined)
      expect(result.status).toBe(404)
    })

    it('returns the user found by steamID64', async () => {
      getUserFromSteamID64Mock.mockResolvedValueOnce({ id: 'u1' })
      const result = await processGetProfile('765', undefined)
      expect(result).toEqual({ status: 200, body: { id: 'u1' } })
    })
  })

  describe('processGetUserSessions', () => {
    it('returns only safe session DTOs and identifies the exact current device', async () => {
      listSessionsMock.mockResolvedValueOnce([{ id: 'session-A', isCurrent: true }])
      const result = await processGetUserSessions('d1', 'session-A')
      expect(listSessionsMock).toHaveBeenCalledWith('d1', 'session-A')
      expect(result).toEqual({ status: 200, body: [{ id: 'session-A', isCurrent: true }] })
      expect(JSON.stringify(result.body)).not.toContain('accessToken')
    })
  })

  describe('processDeleteUserSession', () => {
    it('does not revoke a missing session or a session owned by another account', async () => {
      revokeSessionMock.mockResolvedValueOnce(false)
      expect((await processDeleteUserSession('d1', 'session-other')).status).toBe(404)
      expect(revokeSessionMock).toHaveBeenCalledWith('session-other', 'd1')
    })
    it('uses shared durable revocation and returns no original credential', async () => {
      revokeSessionMock.mockResolvedValueOnce(true)
      expect(await processDeleteUserSession('d1', 'session-A')).toEqual({ status: 200, body: { revoked: true } })
      expect(revokeSessionMock).toHaveBeenCalledWith('session-A', 'd1')
      expect(prismaMock.gm_panelToken.update).not.toHaveBeenCalled()
    })
  })

  describe('processLogOut', () => {
    it('revokes session A presented by the caller rather than a more recent B', async () => {
      resolveSessionMock.mockResolvedValueOnce({ id: 'session-A', discordID: 'd1' })
      expect(await processLogOut('d1', 'token-A')).toEqual({ status: 200, body: { revoked: true } })
      expect(resolveSessionMock).toHaveBeenCalledWith('token-A')
      expect(revokeSessionMock).toHaveBeenCalledWith('session-A', 'd1')
      expect(prismaMock.gm_panelToken.findFirst).not.toHaveBeenCalled()
    })
    it('is idempotent when the credential is already expired or revoked', async () => {
      resolveSessionMock.mockResolvedValueOnce(null)
      expect(await processLogOut('d1', 'old-token')).toEqual({ status: 200, body: { revoked: true } })
      expect(revokeSessionMock).not.toHaveBeenCalled()
    })
    it('cannot revoke another account session by passing a different discord ID', async () => {
      resolveSessionMock.mockResolvedValueOnce({ id: 'session-B', discordID: 'other' })
      expect(await processLogOut('d1', 'token-B')).toEqual({ status: 200, body: { revoked: true } })
      expect(revokeSessionMock).not.toHaveBeenCalled()
    })
  })

  describe('processCreateNewServer', () => {
    it('forbids creating a second server on a non-premium guild', async () => {
      const guild = {
        id: 'g1',
        isPremium: vi.fn().mockResolvedValueOnce(false),
        getServers: vi.fn().mockResolvedValueOnce([{ id: 's1' }]),
      }
      accessMock.mockResolvedValue(accessSnapshot(false))
      prismaMock.gm_server.count.mockResolvedValueOnce(1)
      await expect(processCreateNewServer(guild)).rejects.toMatchObject({
        code: 'quota_reached',
        capability: 'guild.servers',
      })
    })

    it('creates a server for a premium guild even if it already has one', async () => {
      const guild = {
        id: 'g1',
        isPremium: vi.fn().mockResolvedValueOnce(true),
        getServers: vi.fn().mockResolvedValueOnce([{ id: 's1' }]),
      }
      createServerMock.mockResolvedValueOnce({ id: 's2' })
      const result = await processCreateNewServer(guild)
      expect(result).toEqual({ status: 200, body: { id: 's2' } })
    })

    it('creates the first server for a non-premium guild', async () => {
      const guild = {
        id: 'g1',
        isPremium: vi.fn().mockResolvedValueOnce(false),
        getServers: vi.fn().mockResolvedValueOnce([]),
      }
      createServerMock.mockResolvedValueOnce({ id: 's1' })
      const result = await processCreateNewServer(guild)
      expect(result).toEqual({ status: 200, body: { id: 's1' } })
    })
  })

  describe('processPutGmodToDiscordFilter', () => {
    const payload = { element: 'message', operator: 'equal', trigger: 'x', action: 'block', active: true }

    it('returns 400 when required fields are missing', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPutGmodToDiscordFilter({ id: 's1' }, '1', payload)
      expect(result.status).toBe(400)
    })

    it('allows a partial disable after expiration but rejects edits and activation', async () => {
      accessMock.mockResolvedValue(accessSnapshot(false))
      const existing = { id: 1, element: 'message', operator: 'contain', trigger: 'old', action: 'relay', active: true }
      prismaMock.gm_server_sync_chat_filter.findFirst.mockResolvedValue(existing)
      prismaMock.gm_server_sync_chat_filter.update.mockResolvedValue({ ...existing, active: false })
      badArgumentMock.mockReturnValueOnce('0, 1, 2, 3')
      expect(
        (
          await processPutGmodToDiscordFilter({ id: 's1', guild: 'g1' }, '1', {
            element: undefined,
            operator: undefined,
            trigger: undefined,
            action: undefined,
            active: false,
          })
        ).status,
      ).toBe(200)
      expect(prismaMock.gm_server_sync_chat_filter.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { element: 'message', operator: 'contain', trigger: 'old', action: 'relay', active: false },
      })
      await expect(processPutGmodToDiscordFilter({ id: 's1', guild: 'g1' }, '1', payload)).rejects.toMatchObject({
        code: 'upgrade_required',
      })
      await expect(
        processPutGmodToDiscordFilter({ id: 's1', guild: 'g1' }, '1', {
          ...payload,
          active: false,
          trigger: 'changed',
        }),
      ).rejects.toMatchObject({ code: 'upgrade_required' })
      expect(prismaMock.gm_server_sync_chat_filter.update).toHaveBeenCalledOnce()
    })

    it('returns 404 when the filter is not found', async () => {
      prismaMock.gm_server_sync_chat_filter.findFirst.mockResolvedValueOnce(null)
      const result = await processPutGmodToDiscordFilter({ id: 's1' }, '1', payload)
      expect(result.status).toBe(404)
    })

    it('updates only the given fields, keeping existing values for the rest, and clears the redis cache', async () => {
      prismaMock.gm_server_sync_chat_filter.findFirst.mockResolvedValueOnce({
        id: 1,
        element: 'name',
        operator: 'contain',
        trigger: 'old',
        action: 'relay',
        active: false,
      })
      prismaMock.gm_server_sync_chat_filter.update.mockResolvedValueOnce({ id: 1 })

      await processPutGmodToDiscordFilter({ id: 's1' }, '1', {
        element: undefined,
        operator: undefined,
        trigger: 'new',
        action: undefined,
        active: undefined,
      })

      expect(prismaMock.gm_server_sync_chat_filter.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { element: 'name', operator: 'contain', trigger: 'new', action: 'relay', active: false },
      })
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:gmodToDiscordFilter')
    })

    it('overwrites every field when all are given', async () => {
      prismaMock.gm_server_sync_chat_filter.findFirst.mockResolvedValueOnce({
        id: 1,
        element: 'name',
        operator: 'contain',
        trigger: 'old',
        action: 'relay',
        active: false,
      })
      prismaMock.gm_server_sync_chat_filter.update.mockResolvedValueOnce({ id: 1 })

      await processPutGmodToDiscordFilter({ id: 's1' }, '1', {
        element: 'message',
        operator: 'equal',
        trigger: undefined,
        action: 'block',
        active: true,
      })

      expect(prismaMock.gm_server_sync_chat_filter.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { element: 'message', operator: 'equal', trigger: 'old', action: 'block', active: true },
      })
    })
  })

  describe('processDeleteGmodToDiscordFilter', () => {
    it('returns 404 when the filter is not found', async () => {
      prismaMock.gm_server_sync_chat_filter.findFirst.mockResolvedValueOnce(null)
      const result = await processDeleteGmodToDiscordFilter({ id: 's1' }, '1')
      expect(result.status).toBe(404)
    })

    it('deletes the filter and clears the redis cache', async () => {
      prismaMock.gm_server_sync_chat_filter.findFirst.mockResolvedValueOnce({ id: 1 })
      const result = await processDeleteGmodToDiscordFilter({ id: 's1' }, '1')
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:gmodToDiscordFilter')
      expect(prismaMock.gm_server_sync_chat_filter.delete).toHaveBeenCalledWith({ where: { id: 1 } })
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })
  })

  describe('processGetServerPlayers', () => {
    it('rejects an invalid searchColum', async () => {
      const result = await processGetServerPlayers('s1', { searchColum: 'not_allowed' })
      expect(result.status).toBe(400)
    })

    it('rejects an invalid order', async () => {
      const result = await processGetServerPlayers('s1', { order: 'sideways' })
      expect(result.status).toBe(400)
    })

    it('queries with defaults and returns the rows/query payload', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ id: 1 }])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(1)

      const result = await processGetServerPlayers('s1', {})

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0, orderBy: { total_time: 'desc' } }),
      )
      expect(result).toEqual({
        status: 200,
        body: {
          rows: [{ id: 1 }],
          query: { limit: 50, offset: 0, order: 'desc', total: 1, searchColum: 'total_time' },
        },
      })
    })

    it('accepts array-valued limit/offset/order/searchColum/search query params', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)

      await processGetServerPlayers('s1', {
        limit: ['10'],
        offset: ['5'],
        order: ['asc'],
        searchColum: ['name'],
        search: ['bob'],
      })

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 5, orderBy: { name: 'asc' } }),
      )
    })

    it('falls back to defaults for non-finite numeric query values', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)

      await processGetServerPlayers('s1', { limit: 'not-a-number', offset: 'also-not' })

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }))
    })

    it('accepts plain (non-array) numeric-string limit/offset', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)

      await processGetServerPlayers('s1', { limit: '20', offset: '3' })

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 3 }))
    })

    it('falls back to the default when an array-valued limit/offset is non-finite', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)

      await processGetServerPlayers('s1', { limit: ['not-a-number'], offset: ['also-not'] })

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }))
    })

    it('falls back to the fallback string when searchColum is an empty array', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)

      await processGetServerPlayers('s1', { searchColum: [] })

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { total_time: 'desc' } }),
      )
    })

    it('stringifies a non-string, non-array, non-nullish search value', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)

      await processGetServerPlayers('s1', { search: 12345 as any })

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.arrayContaining([{ name: { contains: '12345' } }]) }),
        }),
      )
    })
  })

  describe('processPutPlayerBypassMaintenance', () => {
    it('returns 400 when bypassMaintenance is missing', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const server = { id: 's1' }
      const result = await processPutPlayerBypassMaintenance(server, 'p1', undefined)
      expect(result.status).toBe(400)
    })

    it('returns 404 when the player is not found', async () => {
      const server = { id: 's1', getPlayerStats: vi.fn().mockResolvedValueOnce(null) }
      const result = await processPutPlayerBypassMaintenance(server, 'p1', true)
      expect(result.status).toBe(404)
    })

    it('updates the player bypassMaintenance flag', async () => {
      const server = {
        id: 's1',
        getPlayerStats: vi.fn().mockResolvedValueOnce({ steam_id: '765', bypassMaintenance: false }),
      }
      prismaMock.gm_server_stat.update.mockResolvedValueOnce({ bypassMaintenance: true })

      const result = await processPutPlayerBypassMaintenance(server, 'p1', true)

      expect(prismaMock.gm_server_stat.update).toHaveBeenCalledWith({
        where: { server_id_steam_id: { steam_id: '765', server_id: 's1' } },
        data: { bypassMaintenance: true },
      })
      expect(result).toEqual({ status: 200, body: { bypassMaintenance: true } })
    })

    it('keeps the existing value when bypassMaintenance is explicitly undefined-but-passed badArgument check', async () => {
      const server = {
        id: 's1',
        getPlayerStats: vi.fn().mockResolvedValueOnce({ steam_id: '765', bypassMaintenance: true }),
      }
      prismaMock.gm_server_stat.update.mockResolvedValueOnce({})
      // badArgument is mocked to allow this through even though value is undefined
      await processPutPlayerBypassMaintenance(server, 'p1', undefined)
      expect(prismaMock.gm_server_stat.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { bypassMaintenance: true } }),
      )
    })
  })

  describe('processPostUserStartVerification', () => {
    it('returns 404 when the user is not found', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce(null)
      const result = await processPostUserStartVerification('d1')
      expect(result.status).toBe(404)
    })

    it('generates and persists a verification token', async () => {
      prismaMock.gm_user.findFirst.mockResolvedValueOnce({ id: 'd1' })
      prismaMock.gm_user.update.mockResolvedValueOnce({
        token: 'generated-token',
        token_expires: new Date('2026-01-01'),
      })

      const result = await processPostUserStartVerification('d1')

      expect(result).toEqual({
        status: 200,
        body: { token: 'generated-token', expires: new Date('2026-01-01') },
      })
    })
  })

  describe('processPostAutoRoles / processDeleteAutoRoles / processGetAutoRoles', () => {
    it('returns 409 when the auto role already exists', async () => {
      prismaMock.gm_guild_auto_roles.findFirst.mockResolvedValueOnce({ id: 1 })
      const result = await processPostAutoRoles('g1', 'r1')
      expect(result.status).toBe(409)
    })

    it('creates a new auto role', async () => {
      prismaMock.gm_guild_auto_roles.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_guild_auto_roles.create.mockResolvedValueOnce({ id: 1 })
      const result = await processPostAutoRoles('g1', 'r1')
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })

    it('returns 404 when deleting a non-existent auto role', async () => {
      prismaMock.gm_guild_auto_roles.findFirst.mockResolvedValueOnce(null)
      const result = await processDeleteAutoRoles('g1', 'r1')
      expect(result.status).toBe(404)
    })

    it('deletes an existing auto role', async () => {
      prismaMock.gm_guild_auto_roles.findFirst.mockResolvedValueOnce({ id: 1 })
      const result = await processDeleteAutoRoles('g1', 'r1')
      expect(prismaMock.gm_guild_auto_roles.delete).toHaveBeenCalledWith({ where: { roleID: 'r1', guildID: 'g1' } })
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })

    it('lists auto roles for a guild', async () => {
      prismaMock.gm_guild_auto_roles.findMany.mockResolvedValueOnce([{ id: 1 }])
      const result = await processGetAutoRoles('g1')
      expect(result).toEqual({ status: 200, body: [{ id: 1 }] })
    })
  })

  describe('processGetAdminInformations', () => {
    it('aggregates guild/server/user statistics', async () => {
      prismaMock.gm_guild.count.mockResolvedValueOnce(10)
      prismaMock.gm_guild.groupBy.mockResolvedValueOnce([{ language: 'en', _count: { language: 8 } }])
      prismaMock.gm_server.count.mockResolvedValueOnce(5)
      prismaMock.gm_guild.aggregate.mockResolvedValueOnce({ _sum: { member: 100 } })
      prismaMock.gm_user.count.mockResolvedValueOnce(20)
      prismaMock.users.count.mockResolvedValueOnce(15)
      prismaMock.gm_user.count.mockResolvedValueOnce(12) // second call: totalVerified

      const result = await processGetAdminInformations()

      const body = result.body as any
      expect(body.guild.total).toBe(10)
      expect(body.guild.language).toEqual([{ label: 'en', value: 8 }])
      expect(body.server.total).toBe(5)
      expect(body.user.totalDiscordMembers).toBe(100)
      expect(body.user.totalDiscordUser).toBe(20)
      expect(body.user.totalSteamUser).toBe(15)
      expect(body.user.totalVerified).toBe(12)
      expect(body.user.totalUnverified).toBe(88)
      expect(body.user.total).toBe(115)
    })

    it('defaults the aggregated member sum to 0 when null', async () => {
      prismaMock.gm_guild.count.mockResolvedValueOnce(0)
      prismaMock.gm_guild.groupBy.mockResolvedValueOnce([])
      prismaMock.gm_server.count.mockResolvedValueOnce(0)
      prismaMock.gm_guild.aggregate.mockResolvedValueOnce({ _sum: { member: null } })
      prismaMock.gm_user.count.mockResolvedValueOnce(0)
      prismaMock.users.count.mockResolvedValueOnce(0)
      prismaMock.gm_user.count.mockResolvedValueOnce(0)

      const result = await processGetAdminInformations()

      expect((result.body as any).user.totalDiscordMembers).toBe(0)
    })
  })

  describe('processPostGmodPurchase', () => {
    it('refuses to link a revoked purchase without changing its community or rights', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: 'g2', revoke: true })
      expect(await processPostGmodPurchase('g1', 'd1', {}, {})).toEqual({
        status: 403,
        body: { error: 'Purchase revoked' },
      })
      expect(prismaMock.gm_gmodstore_purchases.update).not.toHaveBeenCalled()
      expect(redisMock.del).not.toHaveBeenCalled()
      expect(enqueueDiscordGuildReloadBotInstanceMock).not.toHaveBeenCalled()
    })

    it('transfers a purchase and invalidates both communities despite transient cache and old-bot reload failures', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: 'g2' })
      prismaMock.gm_gmodstore_purchases.update.mockResolvedValueOnce({ steamID64: '765', guild: 'g1' })
      redisMock.del.mockRejectedValue(new Error('Redis temporarily unavailable'))
      enqueueDiscordGuildReloadBotInstanceMock.mockRejectedValueOnce(new Error('Discord worker unavailable'))
      const guild = { getBotClientInfo: vi.fn().mockResolvedValueOnce({ id: 'new-bot' }) }
      const operator = { id: 'operator' }
      expect(await processPostGmodPurchase('g1', 'd1', guild, { user: operator })).toEqual({
        status: 200,
        body: { id: 'new-bot' },
      })
      expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
        where: { steamID64: '765' },
        data: { guild: 'g1' },
      })
      expect(redisMock.del).toHaveBeenCalledTimes(2)
      expect(redisMock.del).toHaveBeenCalledWith(expect.any(String), 'guild:g2:premium')
      expect(redisMock.del).toHaveBeenCalledWith(expect.any(String), 'guild:g1:premium')
      expect(enqueueDiscordGuildReloadBotInstanceMock).toHaveBeenCalledExactlyOnceWith('g2')
      expect(guild.getBotClientInfo).toHaveBeenCalledWith(operator)
    })

    it('invalidates one community without reloading an old bot when reapplying the same purchase', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: 'g1' })
      const guild = { getBotClientInfo: vi.fn().mockResolvedValueOnce({ id: 'same-bot' }) }
      expect(await processPostGmodPurchase('g1', 'd1', guild, { user: {} })).toMatchObject({ status: 200 })
      expect(redisMock.del).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'guild:g1:premium')
      expect(enqueueDiscordGuildReloadBotInstanceMock).not.toHaveBeenCalled()
    })
    it('returns 404 when the user is not linked to steam', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await processPostGmodPurchase('g1', 'd1', {}, {})
      expect(result.status).toBe(404)
    })

    it('returns 404 when there is no purchase for the linked steam account', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      const result = await processPostGmodPurchase('g1', 'd1', {}, {})
      expect(result.status).toBe(404)
    })

    it('links the purchase to the guild and returns the bot client info', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_gmodstore_purchases.update.mockResolvedValueOnce({})
      const guild = { getBotClientInfo: vi.fn().mockResolvedValueOnce({ id: 'bot1' }) }
      const panelUser = { user: { id: 'u1' } }

      const result = await processPostGmodPurchase('g1', 'd1', guild, panelUser)

      expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
        where: { steamID64: '765' },
        data: { guild: 'g1' },
      })
      expect(result).toEqual({ status: 200, body: { id: 'bot1' } })
    })

    it('returns an empty body when getBotClientInfo resolves falsy', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_gmodstore_purchases.update.mockResolvedValueOnce({})
      const guild = { getBotClientInfo: vi.fn().mockResolvedValueOnce(null) }

      const result = await processPostGmodPurchase('g1', 'd1', guild, { user: {} })

      expect(result).toEqual({ status: 200, body: {} })
    })
  })

  describe('processDeleteGmodPurchase', () => {
    it('removes the purchase credentials and reloads the bot even if cached rights cannot be invalidated', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: 'g1' })
      const cleared = { steamID64: '765', guild: '', token: '' }
      prismaMock.gm_gmodstore_purchases.update.mockResolvedValueOnce(cleared)
      redisMock.del.mockRejectedValueOnce(new Error('Redis temporarily unavailable'))
      const guild = {
        mainBotOnGuild: vi.fn().mockResolvedValueOnce(true),
        reloadBotInstance: vi.fn().mockResolvedValueOnce(undefined),
      }
      expect(await processDeleteGmodPurchase('d1', guild)).toEqual({
        status: 200,
        body: { steamID64: cleared.steamID64, guild: cleared.guild },
      })
      expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
        where: { steamID64: '765' },
        data: { guild: '', token: '' },
        select: { steamID64: true, guild: true, revoke: true, createdAt: true, updatedAt: true },
      })
      expect(redisMock.del).toHaveBeenCalledWith(expect.any(String), 'guild:g1:premium')
      expect(guild.reloadBotInstance).toHaveBeenCalledOnce()
    })
    it('returns 400 when the main bot is not on the guild', async () => {
      const guild = { mainBotOnGuild: vi.fn().mockResolvedValueOnce(false) }
      const result = await processDeleteGmodPurchase('d1', guild)
      expect(result.status).toBe(400)
    })

    it('returns 404 when the user is not linked to steam', async () => {
      const guild = { mainBotOnGuild: vi.fn().mockResolvedValueOnce(true) }
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await processDeleteGmodPurchase('d1', guild)
      expect(result.status).toBe(404)
    })

    it('returns 404 when there is no purchase', async () => {
      const guild = { mainBotOnGuild: vi.fn().mockResolvedValueOnce(true) }
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      const result = await processDeleteGmodPurchase('d1', guild)
      expect(result.status).toBe(404)
    })

    it('clears the purchase, reloads the bot instance, and returns 200', async () => {
      const guild = {
        mainBotOnGuild: vi.fn().mockResolvedValueOnce(true),
        reloadBotInstance: vi.fn().mockResolvedValueOnce(undefined),
      }
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_gmodstore_purchases.update.mockResolvedValueOnce({ steamID64: '765', guild: '' })

      const result = await processDeleteGmodPurchase('d1', guild)

      expect(guild.reloadBotInstance).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { steamID64: '765', guild: '' } })
    })
  })

  describe('processDeleteUserGmodPurchase', () => {
    it('returns 404 when the user is not linked to steam', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await processDeleteUserGmodPurchase('d1', 'g1')
      expect(result.status).toBe(404)
    })

    it('returns 404 when there is no purchase', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      const result = await processDeleteUserGmodPurchase('d1', 'g1')
      expect(result.status).toBe(404)
    })

    it('returns 409 when the purchase is not linked to any guild', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: '' })
      const result = await processDeleteUserGmodPurchase('d1', 'g1')
      expect(result.status).toBe(409)
    })

    it('returns 404 when the purchase is linked to a different guild', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: 'g2' })
      const result = await processDeleteUserGmodPurchase('d1', 'g1')
      expect(result.status).toBe(404)
    })

    it('unlinks the purchase and swallows a reload-bot-instance failure', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: 'g1', steamID64: '765' })
      prismaMock.gm_gmodstore_purchases.update.mockResolvedValueOnce({ guild: '', steamID64: '765' })
      redisMock.del.mockRejectedValueOnce(new Error('Redis temporarily unavailable'))
      enqueueDiscordGuildReloadBotInstanceMock.mockRejectedValueOnce(new Error('discord down'))

      const result = await processDeleteUserGmodPurchase('d1', 'g1')

      expect(enqueueDiscordGuildReloadBotInstanceMock).toHaveBeenCalledWith('g1')
      expect(redisMock.del).toHaveBeenCalledWith(expect.any(String), 'guild:g1:premium')
      expect(result).toEqual({ status: 200, body: { guild: '', steamID64: '765' } })
    })
  })

  describe('processGetUserGmodStorePurchases', () => {
    it('projects only purchase state and never returns stored bot credentials or unrelated fields', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({
        steamID64: '765',
        guild: 'g1',
        revoke: false,
        token: 'private-bot-token-marker',
        userID: 'private-store-buyer',
      })
      enqueueMainClientHasGuildMock.mockResolvedValueOnce(true)
      const result = await processGetUserGmodStorePurchases('d1')
      expect(result).toEqual({ status: 200, body: { steamID64: '765', guild: 'g1', revoke: false, hasMainBot: true } })
      expect(JSON.stringify(result)).not.toMatch(/private-bot-token-marker|private-store-buyer|"token"/)
      expect(prismaMock.gm_gmodstore_purchases.findFirst).toHaveBeenCalledWith({
        where: { steamID64: '765' },
        select: { steamID64: true, guild: true, revoke: true, createdAt: true, updatedAt: true },
      })
    })

    it('returns 404 when the user is not linked to steam', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await processGetUserGmodStorePurchases('d1')
      expect(result.status).toBe(404)
    })

    it('returns an empty object when there is no purchase', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      const result = await processGetUserGmodStorePurchases('d1')
      expect(result).toEqual({ status: 200, body: {} })
    })

    it('does not check hasMainBot when the purchase has no guild', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: '' })
      const result = await processGetUserGmodStorePurchases('d1')
      expect(enqueueMainClientHasGuildMock).not.toHaveBeenCalled()
      expect((result.body as any).hasMainBot).toBeUndefined()
    })

    it('checks hasMainBot when the purchase is linked to a guild', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: 'g1' })
      enqueueMainClientHasGuildMock.mockResolvedValueOnce(true)

      const result = await processGetUserGmodStorePurchases('d1')

      expect((result.body as any).hasMainBot).toBe(true)
    })

    it('swallows a hasMainBot check failure', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765', guild: 'g1' })
      enqueueMainClientHasGuildMock.mockRejectedValueOnce(new Error('bullmq down'))

      const result = await processGetUserGmodStorePurchases('d1')

      expect((result.body as any).hasMainBot).toBe(false)
    })
  })

  describe('processPutServerPseudo / processDeleteServerPseudo', () => {
    it('returns 404 when the pseudo is not found (put)', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
      const result = await processPutServerPseudo('s1', '1', {} as any)
      expect(result.status).toBe(404)
    })

    it('updates only the given fields', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce({
        id: 1,
        name: 'old',
        prefix: 'p',
        role: 'r1',
        enabled: true,
      })
      prismaMock.gm_server_pseudo.update.mockResolvedValueOnce({ id: 1 })

      await processPutServerPseudo('s1', '1', { role: undefined, name: 'new', prefix: undefined, enabled: false })

      expect(prismaMock.gm_server_pseudo.update).toHaveBeenCalledWith({
        where: { id: 1, serverID: 's1' },
        data: { name: 'new', prefix: 'p', role: 'r1', enabled: false },
      })
    })

    it('keeps the existing name/enabled and overwrites role/prefix when only those are given', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce({
        id: 1,
        name: 'old',
        prefix: 'p',
        role: 'r1',
        enabled: true,
      })
      prismaMock.gm_server_pseudo.update.mockResolvedValueOnce({ id: 1 })

      await processPutServerPseudo('s1', '1', { role: 'r2', name: undefined, prefix: 'p2', enabled: undefined })

      expect(prismaMock.gm_server_pseudo.update).toHaveBeenCalledWith({
        where: { id: 1, serverID: 's1' },
        data: { name: 'old', prefix: 'p2', role: 'r2', enabled: true },
      })
    })

    it('returns 404 when the pseudo is not found (delete)', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
      const result = await processDeleteServerPseudo('s1', '1')
      expect(result.status).toBe(404)
    })

    it('deletes the pseudo', async () => {
      prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce({ id: 1 })
      const result = await processDeleteServerPseudo('s1', '1')
      expect(prismaMock.gm_server_pseudo.delete).toHaveBeenCalledWith({ where: { id: 1, serverID: 's1' } })
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })
  })

  describe('processPatchUserNotifications', () => {
    it('returns 404 when the notification is not found', async () => {
      prismaMock.gm_users_notifications.findFirst.mockResolvedValueOnce(null)
      const result = await processPatchUserNotifications('d1', '1')
      expect(result.status).toBe(404)
    })

    it('marks the notification as read', async () => {
      prismaMock.gm_users_notifications.findFirst.mockResolvedValueOnce({ id: 1 })
      prismaMock.gm_users_notifications.update.mockResolvedValueOnce({ id: 1, read: true })
      const result = await processPatchUserNotifications('d1', '1')
      expect(result).toEqual({ status: 200, body: { id: 1, read: true } })
    })
  })

  describe('processGetServerLogs', () => {
    it('refuses to read history for a server that no longer resolves to a community', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      expect(await processGetServerLogs('missing-server', {})).toEqual({
        status: 404,
        body: { error: 'Server not found' },
      })
      expect(accessMock).not.toHaveBeenCalled()
      expect(getTotalLogsByServerMock).not.toHaveBeenCalled()
      expect(getLogsByServerMock).not.toHaveBeenCalled()
    })
    it('rejects an invalid sort column', async () => {
      const result = await processGetServerLogs('s1', { sort: 'not_allowed' })
      expect(result.status).toBe(400)
    })

    it('queries with defaults', async () => {
      getTotalLogsByServerMock.mockResolvedValueOnce(3)
      getLogsByServerMock.mockResolvedValueOnce([{ id: 1 }])

      const result = await processGetServerLogs('s1', {})

      expect(getLogsByServerMock).toHaveBeenCalledWith('s1', {
        offset: 0,
        limit: 50,
        orderBy: 'desc',
        sort: 'createdAt',
        readLimit: null,
      })
      expect(result).toEqual({
        status: 200,
        body: { logs: [{ id: 1 }], query: { offset: 0, limit: 50, sort: 'createdAt', orderBy: 'DESC', total: 3 } },
      })
    })

    it('bounds the total and passes a latest-window restriction for Free', async () => {
      accessMock.mockResolvedValue(accessSnapshot(false))
      getTotalLogsByServerMock.mockResolvedValueOnce(5000)
      getLogsByServerMock.mockResolvedValueOnce([])
      expect(await processGetServerLogs('s1', { offset: 600, orderBy: 'asc' }, 'g1')).toMatchObject({
        body: { query: { total: 500 } },
      })
      expect(getLogsByServerMock).toHaveBeenCalledWith('s1', expect.objectContaining({ offset: 600, readLimit: 500 }))
      expect(accessMock).toHaveBeenCalledWith('g1')
    })

    it('clamps negative/NaN offset and out-of-range limit', async () => {
      getTotalLogsByServerMock.mockResolvedValueOnce(0)
      getLogsByServerMock.mockResolvedValueOnce([])

      await processGetServerLogs('s1', { offset: '-5', limit: '9999' })

      expect(getLogsByServerMock).toHaveBeenCalledWith('s1', expect.objectContaining({ offset: 0, limit: 500 }))
    })

    it('clamps a NaN limit to the default 50', async () => {
      getTotalLogsByServerMock.mockResolvedValueOnce(0)
      getLogsByServerMock.mockResolvedValueOnce([])

      await processGetServerLogs('s1', { limit: 'not-a-number' })

      expect(getLogsByServerMock).toHaveBeenCalledWith('s1', expect.objectContaining({ limit: 50 }))
    })

    it('orders ascending when orderBy is "asc"', async () => {
      getTotalLogsByServerMock.mockResolvedValueOnce(0)
      getLogsByServerMock.mockResolvedValueOnce([])

      await processGetServerLogs('s1', { orderBy: 'asc' })

      expect(getLogsByServerMock).toHaveBeenCalledWith('s1', expect.objectContaining({ orderBy: 'asc' }))
    })
  })

  describe('processGetServerWarns', () => {
    it('rejects an invalid sort column', async () => {
      const result = await processGetServerWarns('s1', { sort: 'not_allowed' })
      expect(result.status).toBe(400)
    })

    it('queries with defaults', async () => {
      prismaMock.gm_server_warn.count.mockResolvedValueOnce(2)
      prismaMock.gm_server_warn.findMany.mockResolvedValueOnce([{ id: 1 }])

      const result = await processGetServerWarns('s1', {})

      expect(prismaMock.gm_server_warn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50, orderBy: { createdAt: 'desc' } }),
      )
      expect(result).toEqual({
        status: 200,
        body: { warns: [{ id: 1 }], query: { offset: 0, limit: 50, sort: 'createdAt', orderBy: 'DESC', total: 2 } },
      })
    })

    it('clamps offset/limit and orders ascending', async () => {
      prismaMock.gm_server_warn.count.mockResolvedValueOnce(0)
      prismaMock.gm_server_warn.findMany.mockResolvedValueOnce([])

      await processGetServerWarns('s1', { offset: '-1', limit: '0', orderBy: 'asc' })

      expect(prismaMock.gm_server_warn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50, orderBy: { createdAt: 'asc' } }),
      )
    })

    it('clamps an out-of-range limit down to 500', async () => {
      prismaMock.gm_server_warn.count.mockResolvedValueOnce(0)
      prismaMock.gm_server_warn.findMany.mockResolvedValueOnce([])

      await processGetServerWarns('s1', { limit: '9999' })

      expect(prismaMock.gm_server_warn.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }))
    })
  })

  describe('processGetGuildBans', () => {
    function makeGuild(overrides: Record<string, any> = {}) {
      return {
        id: 'g1',
        getDiscordBans: vi.fn().mockResolvedValue([]),
        ...overrides,
      } as any
    }

    it('returns empty lists when the guild has no servers and no Discord bans', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([])
      const guild = makeGuild()

      const result = await processGetGuildBans(guild)

      expect(prismaMock.gm_server_ban.findMany).not.toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { gmodBans: [], discordBans: [] } })
    })

    it('aggregates gm_server_ban across every server of the guild, capped at 1000', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ getID: () => 's1' }, { getID: () => 's2' }])
      prismaMock.gm_server_ban.findMany.mockResolvedValueOnce([])
      const guild = makeGuild()

      await processGetGuildBans(guild)

      expect(prismaMock.gm_server_ban.findMany).toHaveBeenCalledWith({
        where: { serverID: { in: ['s1', 's2'] } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      })
    })

    it('flags a GMod ban as also-banned-on-Discord when the linked account is in the Discord ban list', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ getID: () => 's1' }])
      prismaMock.gm_server_ban.findMany.mockResolvedValueOnce([{ userSteamID64: '765', reason: 'cheating' }])
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
      const guild = makeGuild({
        getDiscordBans: vi.fn().mockResolvedValue([{ id: 'd1', tag: 'Cheater#0001', reason: null }]),
      })

      const result = await processGetGuildBans(guild)

      expect(result.body.gmodBans).toEqual([
        { userSteamID64: '765', reason: 'cheating', linkedDiscordID: 'd1', discordAlsoBanned: true },
      ])
    })

    it('does not flag a GMod ban whose linked Discord account is not banned', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ getID: () => 's1' }])
      prismaMock.gm_server_ban.findMany.mockResolvedValueOnce([{ userSteamID64: '765', reason: 'cheating' }])
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
      const guild = makeGuild()

      const result = await processGetGuildBans(guild)

      expect(result.body.gmodBans).toEqual([
        { userSteamID64: '765', reason: 'cheating', linkedDiscordID: 'd1', discordAlsoBanned: false },
      ])
    })

    it('does not flag a GMod ban whose SteamID64 has no linked Discord account', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ getID: () => 's1' }])
      prismaMock.gm_server_ban.findMany.mockResolvedValueOnce([{ userSteamID64: '765', reason: 'cheating' }])
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)
      const guild = makeGuild()

      const result = await processGetGuildBans(guild)

      expect(result.body.gmodBans).toEqual([
        { userSteamID64: '765', reason: 'cheating', linkedDiscordID: null, discordAlsoBanned: false },
      ])
    })

    it('flags a Discord ban as also-banned-on-GMod when the linked account is in the GMod ban list', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ getID: () => 's1' }])
      prismaMock.gm_server_ban.findMany.mockResolvedValueOnce([{ userSteamID64: '765', reason: 'cheating' }])
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
      getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
      const guild = makeGuild({
        getDiscordBans: vi.fn().mockResolvedValue([{ id: 'd1', tag: 'Cheater#0001', reason: null }]),
      })

      const result = await processGetGuildBans(guild)

      expect(result.body.discordBans).toEqual([
        { id: 'd1', tag: 'Cheater#0001', reason: null, linkedSteamID64: '765', gmodAlsoBanned: true },
      ])
    })

    it('does not flag a Discord ban with no linked GMod account', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([])
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const guild = makeGuild({
        getDiscordBans: vi.fn().mockResolvedValue([{ id: 'd1', tag: 'Rando#0002', reason: null }]),
      })

      const result = await processGetGuildBans(guild)

      expect(result.body.discordBans).toEqual([
        { id: 'd1', tag: 'Rando#0002', reason: null, linkedSteamID64: null, gmodAlsoBanned: false },
      ])
    })
  })

  describe('processGetScreenshotsList', () => {
    it('queries with defaults', async () => {
      prismaMock.gm_server_screenshots.findMany.mockResolvedValueOnce([{ id: 1 }])
      prismaMock.gm_server_screenshots.count.mockResolvedValueOnce(1)

      const result = await processGetScreenshotsList('s1', {})

      expect(prismaMock.gm_server_screenshots.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50, orderBy: { createdAt: 'desc' } }),
      )
      expect(result).toEqual({
        status: 200,
        body: {
          screenshots: [{ id: 1 }],
          query: { offset: 0, limit: 50, sort: 'createdAt', orderBy: 'DESC', total: 1 },
        },
      })
    })

    it('clamps offset/limit and orders ascending', async () => {
      prismaMock.gm_server_screenshots.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_screenshots.count.mockResolvedValueOnce(0)

      await processGetScreenshotsList('s1', { offset: '-1', limit: '0', orderBy: 'asc' })

      expect(prismaMock.gm_server_screenshots.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50, orderBy: { createdAt: 'asc' } }),
      )
    })

    it('clamps an out-of-range limit down to 500', async () => {
      prismaMock.gm_server_screenshots.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_screenshots.count.mockResolvedValueOnce(0)

      await processGetScreenshotsList('s1', { limit: '9999' })

      expect(prismaMock.gm_server_screenshots.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }))
    })
  })

  describe('processPostServerLogsTrigger / processPutServerLogsTrigger / processDeleteServerLogsTrigger', () => {
    const payload = {
      action: 'sendMessageInChannel',
      compare: 'amount',
      channelID: 'ch1',
      value: '50',
      operator: 'equal',
      message: 'msg',
      log_type: 'chat',
    }

    it('post: forbids on a non-premium server', async () => {
      const server = { isPremium: vi.fn().mockResolvedValueOnce(false) }
      accessMock.mockResolvedValue(accessSnapshot(false))
      await expect(processPostServerLogsTrigger(server, payload)).rejects.toMatchObject({ code: 'upgrade_required' })
    })

    it('post: returns 400 when required fields are missing', async () => {
      const server = { isPremium: vi.fn().mockResolvedValueOnce(true) }
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPostServerLogsTrigger(server, payload)
      expect(result.status).toBe(400)
    })

    it('post: creates the trigger', async () => {
      const server = {
        isPremium: vi.fn().mockResolvedValueOnce(true),
        createLogsTrigger: vi.fn().mockResolvedValueOnce({ id: 1 }),
      }
      const result = await processPostServerLogsTrigger(server, payload)
      expect(server.createLogsTrigger).toHaveBeenCalledWith(
        'sendMessageInChannel',
        'amount',
        'ch1',
        '50',
        'equal',
        'msg',
        'chat',
      )
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })

    it('put: forbids on a non-premium server', async () => {
      const server = { isPremium: vi.fn().mockResolvedValueOnce(false) }
      accessMock.mockResolvedValue(accessSnapshot(false))
      await expect(processPutServerLogsTrigger(server, '1', payload)).rejects.toMatchObject({
        code: 'upgrade_required',
      })
    })

    it('put: returns 400 when required fields are missing', async () => {
      const server = { isPremium: vi.fn().mockResolvedValueOnce(true) }
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPutServerLogsTrigger(server, '1', payload)
      expect(result.status).toBe(400)
    })

    it('put: updates the trigger', async () => {
      const server = {
        isPremium: vi.fn().mockResolvedValueOnce(true),
        updateLogsTrigger: vi.fn().mockResolvedValueOnce({ id: 1 }),
      }
      const result = await processPutServerLogsTrigger(server, '1', payload)
      expect(server.updateLogsTrigger).toHaveBeenCalledWith(
        1,
        'sendMessageInChannel',
        'amount',
        'ch1',
        '50',
        'equal',
        'msg',
        'chat',
      )
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })

    it('delete: permits stopping a saved trigger after expiration', async () => {
      accessMock.mockResolvedValue(accessSnapshot(false))
      const server = { deleteLogsTrigger: vi.fn().mockResolvedValueOnce({ id: 1 }) }
      expect(await processDeleteServerLogsTrigger(server, '1')).toEqual({ status: 200, body: { id: 1 } })
      expect(server.deleteLogsTrigger).toHaveBeenCalledWith(1)
    })

    it('delete: deletes the trigger', async () => {
      const server = {
        isPremium: vi.fn().mockResolvedValueOnce(true),
        deleteLogsTrigger: vi.fn().mockResolvedValueOnce({ id: 1 }),
      }
      const result = await processDeleteServerLogsTrigger(server, '1')
      expect(server.deleteLogsTrigger).toHaveBeenCalledWith(1)
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })
  })
})
