import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  tables: Object.fromEntries(
    [
      'gm_server',
      'gm_server_links',
      'gm_guild_auto_roles',
      'gm_guild_verify_role',
      'gm_server_sync_roles',
      'gm_server_pseudo',
      'gm_server_sync_team_roles',
      'gm_server_sync_chat_filter',
      'gm_status_button',
      'gm_server_logs_triggers',
    ].map((key) => [key, { count: vi.fn() }]),
  ),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: mocks.tables }))
vi.mock('@gmod/domain-access/index.js', () => ({ resolveGuildAccess: mocks.access }))
const { getDashboardAccess } = await import('../../../src/models/v6/access.js')
const snapshot = {
  guildID: 'guild',
  premium: false,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: 'revision',
  validUntil: '2030-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.access.mockResolvedValue(snapshot)
  for (const table of Object.values(mocks.tables)) table.count.mockResolvedValue(0)
})

describe('dashboard access snapshot and usage', () => {
  it('returns only guild usage without inferring a selected server from a user payload', async () => {
    mocks.tables.gm_server_links.count.mockResolvedValue(2)
    expect(await getDashboardAccess('guild')).toEqual({
      ...snapshot,
      usages: { 'guild.servers': 0, 'guild.links': 2, 'guild.auto_roles': 0, 'verification.roles': 0 },
    })
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith('guild')
    expect(mocks.tables.gm_server_links.count).toHaveBeenCalledWith({ where: { guild: 'guild' } })
    expect(mocks.tables.gm_status_button.count).not.toHaveBeenCalled()
  })
  it('adds server usage scoped to the authorized server', async () => {
    mocks.tables.gm_server_sync_roles.count.mockResolvedValue(4)
    mocks.tables.gm_status_button.count.mockResolvedValue(3)
    const result = await getDashboardAccess('guild', 'server')
    expect(result).toMatchObject({
      serverID: 'server',
      usages: { 'sync.roles.rules': 4, 'status.buttons': 3, 'sync.teams': 0 },
    })
    expect(mocks.tables.gm_server_sync_roles.count).toHaveBeenCalledWith({ where: { serverID: 'server' } })
    expect(mocks.tables.gm_status_button.count).toHaveBeenCalledWith({ where: { server: 'server' } })
    expect(JSON.stringify(result)).not.toMatch(/buyer|transaction|token/i)
  })
  it('reads all usage while entitlement verification and guild counts are still pending', async () => {
    let resolveAccess!: (value: typeof snapshot) => void
    let resolveServers!: (value: number) => void
    mocks.access.mockReturnValueOnce(new Promise((resolve) => (resolveAccess = resolve)))
    mocks.tables.gm_server.count.mockReturnValueOnce(new Promise((resolve) => (resolveServers = resolve)))

    const result = getDashboardAccess('guild', 'server')
    try {
      for (const table of Object.values(mocks.tables)) expect(table.count).toHaveBeenCalledOnce()
    } finally {
      resolveAccess(snapshot)
      resolveServers(2)
      await result
    }
    expect(await result).toMatchObject({ usages: { 'guild.servers': 2, 'status.buttons': 0 } })
  })
  it('preserves unknown entitlement state rather than advertising a Free plan', async () => {
    mocks.access.mockResolvedValue({ ...snapshot, state: 'unknown' })
    expect(await getDashboardAccess('guild')).toMatchObject({ state: 'unknown', premium: false })
  })
  it('does not invent zero usage after a database read fails', async () => {
    mocks.tables.gm_guild_auto_roles.count.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(getDashboardAccess('guild')).rejects.toThrow('Database unavailable')
  })
})
