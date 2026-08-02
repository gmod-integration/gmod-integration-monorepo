import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const prismaMock = {
  gm_role_auto: { findFirst: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

function makeChannel(overrides: any = {}) {
  const rolesCache = new Map<string, any>(overrides.rolesCacheEntries ?? [])
  return {
    guild: {
      id: 'guild1',
      name: 'Test Guild',
      roles: { cache: rolesCache },
      ...overrides.guild,
    },
    permissionOverwrites: { edit: vi.fn() },
    ...overrides.channel,
  }
}

describe('channelCreate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing further when no not-verified role is configured', async () => {
    prismaMock.gm_role_auto.findFirst.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/channelCreate.js')
    const channel = makeChannel()

    await mod.default.execute(channel as any)

    expect(gmLogMock).toHaveBeenCalledWith('event', 'Channel created in guild: Test Guild')
    expect(prismaMock.gm_role_auto.findFirst).toHaveBeenCalledWith({ where: { guild: 'guild1' } })
    expect(channel.permissionOverwrites.edit).not.toHaveBeenCalled()
  })

  it('returns early when the configured role is not present in guild cache', async () => {
    prismaMock.gm_role_auto.findFirst.mockResolvedValue({ id: 'role1' })
    const mod = await import('../../../src/discord/events/channelCreate.js')
    const channel = makeChannel()

    await mod.default.execute(channel as any)

    expect(channel.permissionOverwrites.edit).not.toHaveBeenCalled()
  })

  it('hides the channel from the not-verified role when found', async () => {
    prismaMock.gm_role_auto.findFirst.mockResolvedValue({ id: 'role1' })
    const mod = await import('../../../src/discord/events/channelCreate.js')
    const role = { id: 'role1' }
    const channel = makeChannel({ rolesCacheEntries: [['role1', role]] })

    await mod.default.execute(channel as any)

    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(role, { ViewChannel: false })
  })
})
