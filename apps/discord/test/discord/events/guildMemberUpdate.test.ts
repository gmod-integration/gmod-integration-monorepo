import { beforeEach, describe, expect, it, vi } from 'vitest'
const refreshAccess = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/domain-guild/playerAccessNotifications.js', () => ({ refreshGuildMemberPlayerAccess: refreshAccess }))

const invalidatePermissionsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/domain-user/guildPermissions.js', () => ({
  invalidateDiscordGuildPermissions: invalidatePermissionsMock,
}))

const updateRolesToGmodMock = vi.fn()
const updatePseudoToGmodMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  updateRolesToGmod: updateRolesToGmodMock,
  updatePseudoToGmod: updatePseudoToGmodMock,
}))

describe('guildMemberUpdate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateRolesToGmodMock.mockResolvedValue(undefined)
    updatePseudoToGmodMock.mockResolvedValue(undefined)
    refreshAccess.mockReset().mockResolvedValue(undefined)
    invalidatePermissionsMock.mockReset().mockResolvedValue(undefined)
  })

  it('syncs roles and pseudo for the updated member', async () => {
    const mod = await import('../../../src/discord/events/guildMemberUpdate.js')
    const oldMember = {
      id: 'member1',
      nickname: 'old',
      guild: { id: 'guild1' },
      roles: { cache: { size: 0, some: () => false, has: () => false } },
    }
    const newMember = {
      id: 'member1',
      nickname: 'new',
      guild: { id: 'guild1' },
      roles: { cache: { size: 0, some: () => false, has: () => false } },
    }

    await mod.default.execute(oldMember as any, newMember as any)

    expect(updateRolesToGmodMock).toHaveBeenCalledWith(newMember, oldMember, newMember)
    expect(updatePseudoToGmodMock).toHaveBeenCalledWith(newMember, oldMember, newMember)
    expect(refreshAccess).not.toHaveBeenCalled()
  })
  it('invalidates member permissions before applying role synchronization', async () => {
    const mod = await import('../../../src/discord/events/guildMemberUpdate.js')
    const oldMember = { id: 'member1', guild: { id: 'guild1' }, roles: { cache: { size: 0 } } }
    const newMember = { ...oldMember, roles: { cache: { size: 1 } } }
    await mod.default.execute(oldMember as any, newMember as any)
    expect(invalidatePermissionsMock).toHaveBeenCalledWith({ discordID: 'member1', guildID: 'guild1' })
    expect(invalidatePermissionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateRolesToGmodMock.mock.invocationCallOrder[0],
    )
    expect(refreshAccess).toHaveBeenCalledWith('guild1', 'member1')
  })

  it.each(['role', 'nickname'])(
    'rechecks a partial member and isolates a %s synchronization failure',
    async (stage) => {
      const mod = await import('../../../src/discord/events/guildMemberUpdate.js')
      invalidatePermissionsMock.mockRejectedValueOnce(new Error('permission invalidation failed'))
      refreshAccess.mockRejectedValueOnce(new Error('access notification failed'))
      if (stage === 'role') updateRolesToGmodMock.mockRejectedValueOnce(new Error('role synchronization failed'))
      else updatePseudoToGmodMock.mockRejectedValueOnce(new Error('nickname synchronization failed'))
      const oldMember = { partial: true }
      const member = { id: 'member1', guild: { id: 'guild1' }, partial: true }
      await expect(mod.default.execute(oldMember as any, member as any)).resolves.toBeUndefined()
      expect(refreshAccess).toHaveBeenCalledWith('guild1', 'member1')
      expect(updateRolesToGmodMock).toHaveBeenCalled()
      expect(updatePseudoToGmodMock).toHaveBeenCalled()
    },
  )
  it('rechecks when the new member payload is partial even if the old payload was complete', async () => {
    const mod = await import('../../../src/discord/events/guildMemberUpdate.js')
    const oldMember = { partial: false }
    const member = { id: 'member1', guild: { id: 'guild1' }, partial: true }
    await mod.default.execute(oldMember as any, member as any)
    expect(refreshAccess).toHaveBeenCalledWith('guild1', 'member1')
  })
  it('invalidates a same-sized role replacement, but ignores a nickname-only change', async () => {
    const mod = await import('../../../src/discord/events/guildMemberUpdate.js')
    const oldMember = {
      id: 'member1',
      guild: { id: 'guild1' },
      roles: { cache: { size: 1, has: (id: string) => id === 'old-role' } },
    }
    const newMember = {
      ...oldMember,
      roles: { cache: { size: 1, some: (callback: any) => callback({ id: 'new-role' }) } },
    }
    await mod.default.execute(oldMember as any, newMember as any)
    expect(invalidatePermissionsMock).toHaveBeenCalledTimes(1)
  })
})
