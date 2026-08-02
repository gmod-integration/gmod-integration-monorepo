import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    const oldMember = { id: 'member1', nickname: 'old' }
    const newMember = { id: 'member1', nickname: 'new' }

    await mod.default.execute(oldMember as any, newMember as any)

    expect(updateRolesToGmodMock).toHaveBeenCalledWith(newMember, oldMember, newMember)
    expect(updatePseudoToGmodMock).toHaveBeenCalledWith(newMember, oldMember, newMember)
  })
})
