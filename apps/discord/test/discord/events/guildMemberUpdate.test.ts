import { beforeEach, describe, expect, it, vi } from 'vitest'

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
