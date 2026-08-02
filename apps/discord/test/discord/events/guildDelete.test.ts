import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

let configDiscordMock: any = { clientID: 'main-client-id' }
vi.mock('@gmod/config', () => ({
  get ConfigDiscord() {
    return configDiscordMock
  },
}))

const getGuildClientMock = vi.fn()
const killGuildClientMock = vi.fn()
vi.mock('../../../src/discord/index.js', () => ({
  getGuildClient: getGuildClientMock,
  killGuildClient: killGuildClientMock,
}))

const prismaMock = {
  gm_guild: { findFirst: vi.fn(), delete: vi.fn() },
  gm_gmodstore_purchases: { findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const deleteCachedGuildPreferredLocaleMock = vi.fn()
vi.mock('@gmod/core/utils/guildLocaleCache.js', () => ({
  deleteCachedGuildPreferredLocale: deleteCachedGuildPreferredLocaleMock,
}))

const deleteStoredAvatarMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ deleteStoredAvatar: deleteStoredAvatarMock }))

function makeGuild(overrides: any = {}) {
  return {
    id: 'guild1',
    name: 'Test Guild',
    client: { user: { id: 'main-client-id' } },
    members: { fetch: vi.fn().mockResolvedValue(null) },
    ...overrides,
  }
}

describe('guildDelete event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configDiscordMock = { clientID: 'main-client-id' }
    deleteCachedGuildPreferredLocaleMock.mockResolvedValue(undefined)
    deleteStoredAvatarMock.mockResolvedValue(undefined)
    prismaMock.gm_guild.findFirst.mockResolvedValue(null)
    prismaMock.gm_guild.delete.mockResolvedValue(undefined)
    prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValue(null)
    prismaMock.gm_gmodstore_purchases.update.mockResolvedValue(undefined)
  })

  it('always logs, clears the locale cache, and deletes the stored avatar', async () => {
    getGuildClientMock.mockResolvedValue({ user: null })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(gmLogMock).toHaveBeenCalledWith('event', 'Bot left guild: Test Guild')
    expect(deleteCachedGuildPreferredLocaleMock).toHaveBeenCalledWith('guild1')
    expect(deleteStoredAvatarMock).toHaveBeenCalledWith('guild', 'guild1')
  })

  it('returns early when the guild bot instance has no user', async () => {
    getGuildClientMock.mockResolvedValue({ user: null })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(prismaMock.gm_guild.findFirst).not.toHaveBeenCalled()
  })

  it('returns early when the guild bot instance user does not match the client user', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'other-id' } })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(prismaMock.gm_guild.findFirst).not.toHaveBeenCalled()
  })

  it('kills the guild client and returns early when the fetched member still exists (slave bot)', async () => {
    configDiscordMock = { clientID: 'main-client-id' }
    getGuildClientMock.mockResolvedValue({ user: { id: 'slave-id' } })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const fetchMock = vi.fn().mockResolvedValue({ id: 'slave-id' })
    const guild = makeGuild({ client: { user: { id: 'slave-id' } }, members: { fetch: fetchMock } })

    await mod.default.execute(guild as any)

    expect(fetchMock).toHaveBeenCalledWith('main-client-id')
    expect(killGuildClientMock).toHaveBeenCalledWith('guild1')
    expect(prismaMock.gm_guild.findFirst).not.toHaveBeenCalled()
  })

  it('continues to db cleanup when the slave bot member fetch rejects (member not found)', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'slave-id' } })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const fetchMock = vi.fn().mockRejectedValue(new Error('not found'))
    const guild = makeGuild({ client: { user: { id: 'slave-id' } }, members: { fetch: fetchMock } })

    await mod.default.execute(guild as any)

    expect(killGuildClientMock).toHaveBeenCalledWith('guild1')
    expect(prismaMock.gm_guild.findFirst).toHaveBeenCalledWith({ where: { guild: 'guild1' } })
  })

  it('skips the slave-bot branch entirely when the client user is the main bot', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'main-client-id' } })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(killGuildClientMock).not.toHaveBeenCalled()
    expect(prismaMock.gm_guild.findFirst).toHaveBeenCalledWith({ where: { guild: 'guild1' } })
  })

  it('deletes the db guild row when one exists', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'main-client-id' } })
    prismaMock.gm_guild.findFirst.mockResolvedValue({ guild: 'guild1', member: 5 })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(prismaMock.gm_guild.delete).toHaveBeenCalledWith({ where: { guild: 'guild1' } })
  })

  it('does not delete the db guild row when none exists', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'main-client-id' } })
    prismaMock.gm_guild.findFirst.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(prismaMock.gm_guild.delete).not.toHaveBeenCalled()
  })

  it('unlinks the gmodstore purchase when one is associated with the guild', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'main-client-id' } })
    prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValue({ steamID64: 'steam1' })
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
      where: { steamID64: 'steam1' },
      data: { guild: '', token: '' },
    })
  })

  it('does not touch gmodstore purchases when none is associated with the guild', async () => {
    getGuildClientMock.mockResolvedValue({ user: { id: 'main-client-id' } })
    prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValue(null)
    const mod = await import('../../../src/discord/events/guildDelete.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(prismaMock.gm_gmodstore_purchases.update).not.toHaveBeenCalled()
  })
})
