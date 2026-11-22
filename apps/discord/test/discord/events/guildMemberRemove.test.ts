import { beforeEach, describe, expect, it, vi } from 'vitest'

const invalidatePermissionsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/domain-user/guildPermissions.js', () => ({
  invalidateDiscordGuildPermissions: invalidatePermissionsMock,
}))

const prismaMock = {
  gm_guild: { findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

function makeRemoveInfo(overrides: any = {}) {
  return {
    id: 'member1',
    guild: { id: 'guild1' },
    ...overrides,
  }
}

describe('guildMemberRemove event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when the guild is not tracked in the db', async () => {
    prismaMock.gm_guild.findFirst.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/guildMemberRemove.js')
    const removeInfo = makeRemoveInfo()

    await mod.default.execute(removeInfo as any)

    expect(prismaMock.gm_guild.findFirst).toHaveBeenCalledWith({ where: { guild: 'guild1' } })
    expect(prismaMock.gm_guild.update).not.toHaveBeenCalled()
  })

  it('decrements the stored member count when the guild is tracked', async () => {
    prismaMock.gm_guild.findFirst.mockResolvedValue({ guild: 'guild1', member: 10 })
    const mod = await import('../../../src/discord/events/guildMemberRemove.js')
    const removeInfo = makeRemoveInfo()

    await mod.default.execute(removeInfo as any)

    expect(prismaMock.gm_guild.update).toHaveBeenCalledWith({
      where: { guild: 'guild1' },
      data: { member: 9 },
    })
  })
  it('invalidates removed member rights even when its guild is absent from the database', async () => {
    prismaMock.gm_guild.findFirst.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/guildMemberRemove.js')
    await mod.default.execute(makeRemoveInfo() as any)
    expect(invalidatePermissionsMock).toHaveBeenCalledWith({ discordID: 'member1', guildID: 'guild1' })
    expect(invalidatePermissionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.gm_guild.findFirst.mock.invocationCallOrder[0],
    )
  })
})
