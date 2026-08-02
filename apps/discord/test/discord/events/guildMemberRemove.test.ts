import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  gm_guild: { findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

function makeRemoveInfo(overrides: any = {}) {
  return {
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
})
