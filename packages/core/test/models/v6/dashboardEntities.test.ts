import type * as AccessDomain from '@gmod/domain-access/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'
import type { Guild } from '@gmod/domain-guild/Guild.js'

const accessMock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessDomain>()),
  resolveGuildAccess: accessMock,
}))
const snapshot = (premium = false) => ({
  guildID: 'guild',
  premium,
  customBot: premium,
  state: 'ready' as const,
  sources: [],
  revision: 'test',
  validUntil: '2030-01-01T00:00:00.000Z',
})
const tables = vi.hoisted(() =>
  Object.fromEntries(
    [
      'gm_server_sync_roles',
      'gm_server_sync_team_roles',
      'gm_server_pseudo',
      'gm_server_sync_chat_filter',
      'gm_server_links',
      'gm_guild_verify_role',
    ].map((key) => [key, { create: vi.fn(), count: vi.fn(), findFirst: vi.fn() }]),
  ),
)
const del = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())
const lock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/infra-prisma', () => ({ default: { ...tables, $transaction: transaction } }))
vi.mock('@gmod/infra-redis', () => ({ default: { del } }))
const { createDashboardServerEntity, createDashboardLink, createDashboardVerificationRole } =
  await import('../../../src/models/v6/dashboardEntities.js')
const server = { id: 'server', guild: 'guild' } as Server
const guild = { id: 'guild' } as Guild

beforeEach(() => {
  vi.resetAllMocks()
  accessMock.mockResolvedValue(snapshot(true))
  lock.mockResolvedValue({})
  transaction.mockImplementation(async (operation) =>
    operation({ ...tables, gm_server: { update: lock }, gm_guild: { update: lock } }),
  )
  for (const table of Object.values(tables)) {
    table.count.mockResolvedValue(0)
    table.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }))
  }
})

describe('complete and historical entity creation share access policy', () => {
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
  ])('inserts complete $kind after resolving the server community', async ({ kind, table, input, expected }) => {
    expect((await createDashboardServerEntity(server, kind, input, 'role')).status).toBe(200)
    expect(accessMock).toHaveBeenCalledWith('guild')
    expect(tables[table].create).toHaveBeenCalledExactlyOnceWith({ data: { serverID: 'server', ...expected } })
  })
  it.each(['role', 'team', 'pseudo', 'chatFilter'] as const)(
    'does not persist incomplete complete-form %s',
    async (kind) => {
      expect((await createDashboardServerEntity(server, kind, { enabled: true }, 'role')).status).toBe(400)
      for (const table of Object.values(tables)) expect(table.create).not.toHaveBeenCalled()
    },
  )
  it.each([false, true])('allows four free role rules but denies the fifth for legacy=%s', async (legacy) => {
    accessMock.mockResolvedValue(snapshot())
    tables.gm_server_sync_roles.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4)
    const input = legacy ? undefined : { userGroup: 'admin', enable: true }
    expect((await createDashboardServerEntity(server, 'role', input, 'role', legacy)).status).toBe(200)
    await expect(createDashboardServerEntity(server, 'role', input, 'role', legacy)).rejects.toMatchObject({
      code: 'quota_reached',
      capability: 'sync.roles.rules',
      limit: 4,
      used: 4,
    })
    expect(tables.gm_server_sync_roles.create).toHaveBeenCalledOnce()
  })
  it.each(['team', 'chatFilter'] as const)(
    'blocks premium-only %s through historical empty-body creation too',
    async (kind) => {
      accessMock.mockResolvedValue(snapshot())
      await expect(createDashboardServerEntity(server, kind, undefined, 'role', true)).rejects.toMatchObject({
        code: 'upgrade_required',
      })
      for (const table of Object.values(tables)) expect(table.create).not.toHaveBeenCalled()
    },
  )
  it('keeps verification duplicate, limits and write in the guild transaction', async () => {
    accessMock.mockResolvedValue(snapshot())
    tables.gm_guild_verify_role.findFirst.mockResolvedValueOnce({ id: 9 })
    expect((await createDashboardVerificationRole(guild, 'role', undefined, true)).status).toBe(409)
    tables.gm_guild_verify_role.count.mockResolvedValueOnce(2)
    await expect(
      createDashboardVerificationRole(guild, 'role', { isGiveRole: true, enabled: true }),
    ).rejects.toMatchObject({ code: 'quota_reached', capability: 'verification.roles' })
    expect(tables.gm_guild_verify_role.create).not.toHaveBeenCalled()
    expect(lock).toHaveBeenCalledWith({ where: { guild: 'guild' }, data: { updatedAt: expect.any(Date) } })
  })
  it.each([false, true])('applies guild link quota before insertion for legacy=%s', async (legacy) => {
    accessMock.mockResolvedValue(snapshot())
    tables.gm_server_links.count.mockResolvedValueOnce(2)
    await expect(
      createDashboardLink(
        guild,
        legacy ? undefined : { alias: 'Forum', url: 'https://example.test', active: true },
        legacy,
      ),
    ).rejects.toMatchObject({ code: 'quota_reached', capability: 'guild.links' })
    expect(tables.gm_server_links.create).not.toHaveBeenCalled()
  })
  it('creates valid links and verification rules with their complete data', async () => {
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
  it('rejects unsafe URLs without writes', async () => {
    for (const url of ['', 'javascript:alert(1)'])
      expect((await createDashboardLink(guild, { alias: 'Bad', url, active: true })).status).toBe(400)
    expect(tables.gm_server_links.create).not.toHaveBeenCalled()
  })
  it('preserves significant whitespace and acknowledges a durable filter during cache outage', async () => {
    del.mockRejectedValueOnce(new Error('Redis down'))
    const input = { element: 'message', operator: 'startWith', trigger: ' secret ', action: 'block', active: true }
    expect((await createDashboardServerEntity(server, 'chatFilter', input)).status).toBe(200)
    expect(tables.gm_server_sync_chat_filter.create).toHaveBeenCalledExactlyOnceWith({
      data: { serverID: 'server', ...input },
    })
  })
  it.each([
    { kind: 'role' as const, table: 'gm_server_sync_roles', quota: 4, input: { userGroup: 'admin', enable: true } },
    {
      kind: 'pseudo' as const,
      table: 'gm_server_pseudo',
      quota: 3,
      input: { role: 'admin', name: '', prefix: 'A', enabled: true },
    },
  ])(
    'serializes concurrent $kind creations competing for the last free slot',
    async ({ kind, table, quota, input }) => {
      accessMock.mockResolvedValue(snapshot())
      let count = quota - 1
      let preceding = Promise.resolve()
      tables[table].count.mockImplementation(async () => count)
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
      const results = await Promise.allSettled([
        createDashboardServerEntity(server, kind, input, 'role-a'),
        createDashboardServerEntity(server, kind, input, 'role-b'),
      ])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'quota_reached' },
      })
      expect(count).toBe(quota)
      expect(tables[table].create).toHaveBeenCalledOnce()
    },
  )
  it.each([
    { kind: 'link', table: 'gm_server_links' },
    { kind: 'verification', table: 'gm_guild_verify_role' },
  ])('serializes concurrent guild $kind creation at its free quota', async ({ kind, table }) => {
    accessMock.mockResolvedValue(snapshot())
    let count = 1
    let preceding = Promise.resolve()
    tables[table].count.mockImplementation(async () => count)
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
        return await operation({ ...tables, gm_guild: { update } })
      } finally {
        unlock?.()
      }
    })
    const create = () =>
      kind === 'link'
        ? createDashboardLink(guild, undefined, true)
        : createDashboardVerificationRole(guild, 'role', undefined, true)
    const results = await Promise.allSettled([create(), create()])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'quota_reached' } })
    expect(count).toBe(2)
    expect(tables[table].create).toHaveBeenCalledOnce()
  })
})
