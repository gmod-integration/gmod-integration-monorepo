import { beforeEach, describe, expect, it, vi } from 'vitest'
const refreshAccess = vi.fn()
vi.mock('@gmod/domain-guild/playerAccessNotifications.js', () => ({ refreshGuildRolePlayerAccess: refreshAccess }))
const invalidatePermissions = vi.fn()
vi.mock('@gmod/domain-user/guildPermissions.js', () => ({ invalidateDiscordGuildPermissions: invalidatePermissions }))
const updated = await import('../../../src/discord/events/guildRoleUpdate.js')
const deleted = await import('../../../src/discord/events/guildRoleDelete.js')
const role = (permissions: bigint) => ({ guild: { id: 'guild' }, permissions: { bitfield: permissions } })
beforeEach(() => {
  vi.resetAllMocks()
  invalidatePermissions.mockResolvedValue(undefined)
  refreshAccess.mockResolvedValue(undefined)
})
describe('guild role permission invalidation', () => {
  it('uses the actual Discord role event names', () => {
    expect(updated.default.name).toBe('roleUpdate')
    expect(deleted.default.name).toBe('roleDelete')
  })
  it('invalidates all potentially affected members when permissions change', async () => {
    await updated.default.execute(role(8n) as any, role(0n) as any)
    expect(invalidatePermissions).toHaveBeenCalledExactlyOnceWith({ guildID: 'guild' })
  })
  it('refreshes role-dependent player access even if permission invalidation fails', async () => {
    invalidatePermissions.mockRejectedValueOnce(new Error('permissions unavailable'))
    await deleted.default.execute({ ...role(8n), id: 'deleted' } as any)
    expect(refreshAccess).toHaveBeenCalledWith('guild', 'deleted')
  })
  it('contains a player access notification failure after invalidating permissions', async () => {
    refreshAccess.mockRejectedValueOnce(new Error('notification failed'))
    await expect(deleted.default.execute({ ...role(8n), id: 'deleted' } as any)).resolves.toBeUndefined()
    expect(invalidatePermissions).toHaveBeenCalledExactlyOnceWith({ guildID: 'guild' })
  })
  it('keeps permission caches for a cosmetic role update', async () => {
    await updated.default.execute(role(8n) as any, role(8n) as any)
    expect(invalidatePermissions).not.toHaveBeenCalled()
  })
  it('invalidates removed roles even when members are not cached by Discord', async () => {
    await deleted.default.execute(role(8n) as any)
    expect(invalidatePermissions).toHaveBeenCalledExactlyOnceWith({ guildID: 'guild' })
  })
})
