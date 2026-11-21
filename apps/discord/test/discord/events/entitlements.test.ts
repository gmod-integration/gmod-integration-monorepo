import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entitlement } from 'discord.js'

const invalidate = vi.hoisted(() => vi.fn())
const log = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', () => ({ invalidateGuildAccess: invalidate }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: log }))
const events = await Promise.all([
  import('../../../src/discord/events/entitlementCreate.js'),
  import('../../../src/discord/events/entitlementUpdate.js'),
  import('../../../src/discord/events/entitlementDelete.js'),
])

beforeEach(() => {
  vi.clearAllMocks()
  invalidate.mockResolvedValue(undefined)
})
describe('subscription lifecycle invalidation', () => {
  it.each(events)('invalidates the shared community access snapshot for $default.name', async (event) => {
    await event.default.execute({ guildId: 'community' } as Entitlement)
    expect(invalidate).toHaveBeenCalledExactlyOnceWith('community')
  })
  it('ignores a user-scoped entitlement without a community', async () => {
    await events[0].default.execute({ guildId: null } as Entitlement)
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('leaves a safe reconciliation signal when cache invalidation is unavailable', async () => {
    invalidate.mockRejectedValueOnce(new Error('Private operational details'))
    await expect(events[2].default.execute({ guildId: 'community' } as Entitlement)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('discord', expect.stringContaining('reconciliation'))
    expect(JSON.stringify(log.mock.calls)).not.toContain('Private operational details')
  })
})
