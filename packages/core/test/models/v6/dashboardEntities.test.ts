import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'
import type { Guild } from '@gmod/domain-guild/Guild.js'

const tables = vi.hoisted(() =>
  Object.fromEntries(
    [
      'gm_server_sync_roles',
      'gm_server_sync_team_roles',
      'gm_server_pseudo',
      'gm_server_sync_chat_filter',
      'gm_server_links',
      'gm_guild_verify_role',
    ].map((key) => [key, { create: vi.fn(), count: vi.fn() }]),
  ),
)
const del = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())
const lock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/infra-prisma', () => ({ default: { ...tables, $transaction: transaction } }))
vi.mock('@gmod/infra-redis', () => ({ default: { del } }))
const { createDashboardServerEntity, createDashboardLink, createDashboardVerificationRole } =
  await import('../../../src/models/v6/dashboardEntities.js')
const server = (premium = false) =>
  ({ id: 'server', isPremium: vi.fn().mockResolvedValue(premium) }) as unknown as Server
const guild = { id: 'guild' } as Guild

beforeEach(() => {
  vi.resetAllMocks()
  lock.mockResolvedValue({})
  transaction.mockImplementation(async (operation) => operation({ ...tables, gm_server: { update: lock } }))
  for (const table of Object.values(tables)) {
    table.count.mockResolvedValue(0)
    table.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }))
  }
})

describe('complete dashboard entity creation', () => {
  it.each([
    {
      kind: 'role' as const,
      table: 'gm_server_sync_roles',
      input: { userGroup: ' admin ', enable: true },
      expected: { userGroup: 'admin', enable: true, roleID: 'role' },
    },
    {
      kind: 'team' as const,
      table: 'gm_server_sync_team_roles',
      input: { teamName: ' Police ', enable: true },
      expected: { teamName: 'Police', enable: true, roleID: 'role' },
    },
    {
      kind: 'pseudo' as const,
      table: 'gm_server_pseudo',
      input: { role: 'admin', name: '', prefix: 'A', enabled: true },
      expected: { role: 'admin', name: '', prefix: 'A', enabled: true },
    },
    {
      kind: 'chatFilter' as const,
      table: 'gm_server_sync_chat_filter',
      input: { element: 'message', operator: 'contain', trigger: 'secret', action: 'block', active: true },
      expected: { element: 'message', operator: 'contain', trigger: 'secret', action: 'block', active: true },
    },
  ])('inserts $kind with the complete draft in one write', async ({ kind, table, input, expected }) => {
    const result = await createDashboardServerEntity(server(true), kind, input, 'role')
    expect(result.status).toBe(200)
    expect(tables[table].create).toHaveBeenCalledExactlyOnceWith({ data: { serverID: 'server', ...expected } })
  })
  it.each(['role', 'team', 'pseudo', 'chatFilter'] as const)(
    'rejects an incomplete %s without a placeholder row',
    async (kind) => {
      expect((await createDashboardServerEntity(server(true), kind, { enabled: true }, 'role')).status).toBe(400)
      for (const table of Object.values(tables)) expect(table.create).not.toHaveBeenCalled()
    },
  )
  it('enforces the free rule quota and premium filters', async () => {
    tables.gm_server_sync_roles.count.mockResolvedValue(3)
    expect(
      (await createDashboardServerEntity(server(), 'role', { userGroup: 'admin', enable: true }, 'role')).status,
    ).toBe(403)
    expect(tables.gm_server_sync_roles.create).not.toHaveBeenCalled()
    expect(
      (
        await createDashboardServerEntity(server(), 'chatFilter', {
          element: 'message',
          operator: 'contain',
          trigger: 'secret',
          action: 'block',
          active: true,
        })
      ).status,
    ).toBe(403)
    expect(tables.gm_server_sync_chat_filter.create).not.toHaveBeenCalled()
  })
  it('creates complete links and verification role rules', async () => {
    expect(
      (await createDashboardLink(guild, { alias: 'Forum', url: 'https://example.test', active: true })).status,
    ).toBe(200)
    expect(tables.gm_server_links.create).toHaveBeenCalledWith({
      data: { guild: 'guild', alias: 'Forum', url: 'https://example.test', active: true },
    })
    expect((await createDashboardVerificationRole(guild, 'role', { isGiveRole: false, enabled: true })).status).toBe(
      200,
    )
    expect(tables.gm_guild_verify_role.create).toHaveBeenCalledWith({
      data: { guildID: 'guild', roleID: 'role', isGiveRole: false, enabled: true },
    })
  })
  it('rejects invalid URLs and incomplete verification rules without writing', async () => {
    expect((await createDashboardLink(guild, { alias: 'Bad', url: 'javascript:alert(1)', active: true })).status).toBe(
      400,
    )
    expect((await createDashboardVerificationRole(guild, 'role', { enabled: true })).status).toBe(400)
    expect(tables.gm_server_links.create).not.toHaveBeenCalled()
    expect(tables.gm_guild_verify_role.create).not.toHaveBeenCalled()
  })
  it('preserves significant trigger whitespace and acknowledges a committed filter despite a cache outage', async () => {
    del.mockRejectedValueOnce(new Error('Redis down'))
    const input = { element: 'message', operator: 'startWith', trigger: ' secret ', action: 'block', active: true }
    expect((await createDashboardServerEntity(server(true), 'chatFilter', input)).status).toBe(200)
    expect(tables.gm_server_sync_chat_filter.create).toHaveBeenCalledExactlyOnceWith({
      data: { serverID: 'server', ...input },
    })
  })
  it.each([
    { kind: 'role' as const, table: 'gm_server_sync_roles', input: { userGroup: 'admin', enable: true } },
    { kind: 'team' as const, table: 'gm_server_sync_team_roles', input: { teamName: 'Police', enable: true } },
    {
      kind: 'pseudo' as const,
      table: 'gm_server_pseudo',
      input: { role: 'admin', name: '', prefix: 'A', enabled: true },
    },
  ])('serializes concurrent $kind creations competing for the last free slot', async ({ kind, table, input }) => {
    let count = 2
    let preceding = Promise.resolve()
    tables[table].count.mockImplementation(async () => {
      const snapshot = count
      await Promise.resolve()
      return snapshot
    })
    tables[table].create.mockImplementation(async ({ data }) => ({ id: ++count, ...data }))
    transaction.mockImplementation(async (operation) => {
      let unlock: (() => void) | undefined
      const update = async () => {
        const waiting = preceding
        preceding = new Promise<void>((resolve) => {
          unlock = resolve
        })
        await waiting
        return {}
      }
      try {
        return await operation({ ...tables, gm_server: { update } })
      } finally {
        unlock?.()
      }
    })
    const results = await Promise.all([
      createDashboardServerEntity(server(), kind, input, 'role-a'),
      createDashboardServerEntity(server(), kind, input, 'role-b'),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([200, 403])
    expect(count).toBe(3)
    expect(tables[table].create).toHaveBeenCalledOnce()
    expect(transaction).toHaveBeenCalledTimes(2)
  })
  it('acquires the server lock before reading the quota and leaves full quotas untouched', async () => {
    tables.gm_server_pseudo.count.mockImplementation(async () => {
      expect(lock).toHaveBeenCalledWith({ where: { id: 'server' }, data: { updatedAt: expect.any(Date) } })
      return 3
    })
    const result = await createDashboardServerEntity(server(), 'pseudo', {
      role: 'admin',
      name: '',
      prefix: 'A',
      enabled: true,
    })
    expect(result).toEqual({ status: 403, body: { error: 'limit_reached' } })
    expect(tables.gm_server_pseudo.create).not.toHaveBeenCalled()
  })
})
