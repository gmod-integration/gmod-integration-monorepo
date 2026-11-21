import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'
import type { Guild } from '@gmod/domain-guild/Guild.js'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  serverUpsert: vi.fn(),
  guildUpsert: vi.fn(),
  del: vi.fn(),
  enqueue: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { $transaction: mocks.transaction } }))
vi.mock('@gmod/infra-redis', () => ({ default: { del: mocks.del } }))
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: mocks.enqueue } }))
const { saveServerDashboardSettings, saveGuildDashboardSettings } =
  await import('../../../src/models/v6/dashboardSettings.js')
const server = (premium = false) =>
  ({ id: 'server', isPremium: vi.fn().mockResolvedValue(premium) }) as unknown as Server
const guild = (premium = true) => ({ id: 'guild', isPremium: vi.fn().mockResolvedValue(premium) }) as unknown as Guild

beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation((operation) =>
    operation({ gm_server_settings: { upsert: mocks.serverUpsert }, gm_guild_settings: { upsert: mocks.guildUpsert } }),
  )
  mocks.serverUpsert.mockResolvedValue({})
  mocks.guildUpsert.mockResolvedValue({})
  mocks.del.mockResolvedValue(1)
  mocks.enqueue.mockResolvedValue({})
})

describe('atomic dashboard settings', () => {
  it('commits a section in one transaction before dispatching addon changes', async () => {
    const order: string[] = []
    mocks.transaction.mockImplementation(async (operation) => {
      await operation({ gm_server_settings: { upsert: mocks.serverUpsert } })
      order.push('commit')
    })
    mocks.enqueue.mockImplementation(async () => {
      order.push('dispatch')
    })
    const result = await saveServerDashboardSettings(server(), { ig_syncBan: true, ig_syncKick: false })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.serverUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.serverUpsert).toHaveBeenCalledWith({
      where: { serverID_setting: { serverID: 'server', setting: 'ig_syncBan' } },
      create: { serverID: 'server', setting: 'ig_syncBan', value: 'true' },
      update: { value: 'true' },
    })
    expect(order).toEqual(['commit', 'dispatch', 'dispatch'])
    expect(result).toEqual({ settings: { ig_syncBan: true, ig_syncKick: false }, sync: 'pending' })
  })
  it('does not invalidate caches or enqueue anything after a rolled-back section', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('Database failure'))
    await expect(saveServerDashboardSettings(server(), { ig_syncBan: true, ig_syncKick: false })).rejects.toThrow(
      'Database failure',
    )
    expect(mocks.del).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it.each([
    {},
    { unknown: true },
    { ig_syncBan: 'true' },
    { ig_verifyOnReadyKickTime: -1 },
    { ig_supportLink: 'javascript:alert(1)' },
    { ig_adminRank: {} },
    { pseudoFormat: 'a'.repeat(256) },
  ])('rejects invalid settings before writing: %j', async (input) => {
    await expect(saveServerDashboardSettings(server(true), input)).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('enforces premium permissions before any section writes', async () => {
    await expect(
      saveServerDashboardSettings(server(), { sync_role_direction: 'both', log_hide_ip: true }),
    ).rejects.toMatchObject({ code: 'settings_forbidden' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('commits related server-side settings together without dispatching addon configuration', async () => {
    expect(
      await saveServerDashboardSettings(server(true), { sync_pseudo_direction: 'both', pseudoFormat: '{plyName}' }),
    ).toMatchObject({ sync: 'applied' })
    expect(mocks.serverUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.del).toHaveBeenCalledWith(
      'server:server:setting:sync_pseudo_direction',
      'server:server:setting:pseudoFormat',
    )
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('reports stored settings as pending if post-commit synchronization fails', async () => {
    mocks.del.mockRejectedValueOnce(new Error('Cache down'))
    expect(await saveServerDashboardSettings(server(), { log_hide_ip: true })).toEqual({
      settings: { log_hide_ip: true },
      sync: 'pending',
    })
    expect(mocks.serverUpsert).toHaveBeenCalledOnce()
  })
  it('saves verification preferences together and enforces guild entitlements', async () => {
    const input = { verification_dont_mp: true, verification_dont_join_support: false }
    await expect(saveGuildDashboardSettings(guild(false), input)).rejects.toMatchObject({ code: 'settings_forbidden' })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(await saveGuildDashboardSettings(guild(), input)).toEqual({ settings: input, sync: 'applied' })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.guildUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.del).toHaveBeenCalledWith(
      'server:guild:setting:verification_dont_mp',
      'server:guild:setting:verification_dont_join_support',
    )
  })
})
