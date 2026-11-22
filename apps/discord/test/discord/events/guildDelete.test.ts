import { beforeEach, describe, expect, it, vi } from 'vitest'

const invalidatePermissionsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/domain-user/guildPermissions.js', () => ({
  invalidateDiscordGuildPermissions: invalidatePermissionsMock,
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: gmLogMock }))
vi.mock('@gmod/config', () => ({ ConfigDiscord: { clientID: 'main-client-id' } }))

const getGuildClientMock = vi.fn()
const getMainClientMock = vi.fn()
const killGuildClientMock = vi.fn()
vi.mock('../../../src/discord/index.js', () => ({
  getGuildClient: getGuildClientMock,
  getMainClient: getMainClientMock,
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

const { default: handler } = await import('../../../src/discord/events/guildDelete.js')

function makeGuild(clientID = 'main-client-id') {
  const client = { user: { id: clientID } }
  const guild = {
    id: 'guild1',
    name: 'Test Guild',
    client,
    // This credential has just lost access to the guild; it is never an authority for another bot.
    members: { fetch: vi.fn().mockRejectedValue(Object.assign(new Error('missing access'), { code: 50001 })) },
  }
  getGuildClientMock.mockResolvedValue(client)
  return guild
}

function expectCommunityPreserved() {
  expect(deleteCachedGuildPreferredLocaleMock).not.toHaveBeenCalled()
  expect(deleteStoredAvatarMock).not.toHaveBeenCalled()
  expect(prismaMock.gm_guild.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.gm_guild.delete).not.toHaveBeenCalled()
  expect(prismaMock.gm_gmodstore_purchases.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.gm_gmodstore_purchases.update).not.toHaveBeenCalled()
}

function expectCommunityCleanup() {
  expect(deleteCachedGuildPreferredLocaleMock).toHaveBeenCalledWith('guild1')
  expect(deleteStoredAvatarMock).toHaveBeenCalledWith('guild', 'guild1')
  expect(prismaMock.gm_guild.delete).toHaveBeenCalledWith({ where: { guild: 'guild1' } })
  expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
    where: { steamID64: 'steam1' },
    data: { guild: '', token: '' },
  })
}

describe('guildDelete event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGuildClientMock.mockReset()
    getMainClientMock.mockReset()
    killGuildClientMock.mockReset().mockResolvedValue(undefined)
    invalidatePermissionsMock.mockResolvedValue(undefined)
    deleteCachedGuildPreferredLocaleMock.mockResolvedValue(undefined)
    deleteStoredAvatarMock.mockResolvedValue(undefined)
    prismaMock.gm_guild.findFirst.mockResolvedValue({ guild: 'guild1', member: 5 })
    prismaMock.gm_guild.delete.mockResolvedValue(undefined)
    prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValue({ steamID64: 'steam1' })
    prismaMock.gm_gmodstore_purchases.update.mockResolvedValue(undefined)
  })

  it('preserves the community and activation when only its active custom bot leaves', async () => {
    const guild = makeGuild('custom-client-id')
    const mainFetch = vi.fn().mockResolvedValue({ id: 'guild1' })
    getMainClientMock.mockResolvedValue({ guilds: { fetch: mainFetch } })

    await handler.execute(guild as any)

    expect(mainFetch).toHaveBeenCalledExactlyOnceWith({ guild: 'guild1', force: true })
    expect(guild.members.fetch).not.toHaveBeenCalled()
    expect(killGuildClientMock).toHaveBeenCalledExactlyOnceWith('guild1')
    expectCommunityPreserved()
  })

  it('cleans up after an independent main-bot lookup confirms an unknown guild', async () => {
    const guild = makeGuild('custom-client-id')
    const mainFetch = vi.fn().mockRejectedValue(Object.assign(new Error('unknown guild'), { code: 10004 }))
    getMainClientMock.mockResolvedValue({ guilds: { fetch: mainFetch } })

    await handler.execute(guild as any)

    expect(mainFetch).toHaveBeenCalledExactlyOnceWith({ guild: 'guild1', force: true })
    expect(killGuildClientMock).toHaveBeenCalledExactlyOnceWith('guild1')
    expect(guild.members.fetch).not.toHaveBeenCalled()
    expectCommunityCleanup()
  })

  it.each([
    ['missing access', { code: 50001 }],
    ['missing permissions', { code: 50013 }],
    ['unknown member', { code: 10007 }],
    ['rate limit', { status: 429 }],
    ['provider outage', { status: 503 }],
    ['network timeout', {}],
  ])('keeps all community data when the independent lookup has an ambiguous %s failure', async (message, fields) => {
    const guild = makeGuild('custom-client-id')
    const mainFetch = vi.fn().mockRejectedValue(Object.assign(new Error(message), fields))
    getMainClientMock.mockResolvedValue({ guilds: { fetch: mainFetch } })

    await handler.execute(guild as any)

    expect(killGuildClientMock).toHaveBeenCalledExactlyOnceWith('guild1')
    expect(gmLogMock).toHaveBeenCalledWith('warning', expect.stringContaining('retaining community data'))
    expectCommunityPreserved()
  })

  it('keeps the community when the main client is unavailable', async () => {
    const guild = makeGuild('custom-client-id')
    getMainClientMock.mockRejectedValue(new Error('Main client not ready'))

    await handler.execute(guild as any)

    expect(killGuildClientMock).toHaveBeenCalledExactlyOnceWith('guild1')
    expectCommunityPreserved()
  })

  it('does not infer absence from an empty provider result', async () => {
    const guild = makeGuild('custom-client-id')
    getMainClientMock.mockResolvedValue({ guilds: { fetch: vi.fn().mockResolvedValue(null) } })

    await handler.execute(guild as any)

    expectCommunityPreserved()
  })

  it('retains the existing cleanup for the effective main bot’s authoritative leave event', async () => {
    const guild = makeGuild()

    await handler.execute(guild as any)

    expect(getMainClientMock).not.toHaveBeenCalled()
    expect(killGuildClientMock).not.toHaveBeenCalled()
    expectCommunityCleanup()
  })

  it('does not delete a nonexistent community row', async () => {
    const guild = makeGuild()
    prismaMock.gm_guild.findFirst.mockResolvedValue(null)

    await handler.execute(guild as any)

    expect(prismaMock.gm_guild.delete).not.toHaveBeenCalled()
    expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalled()
  })

  it('does not mutate an unrelated or missing purchase', async () => {
    const guild = makeGuild()
    prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValue(null)

    await handler.execute(guild as any)

    expect(prismaMock.gm_guild.delete).toHaveBeenCalled()
    expect(prismaMock.gm_gmodstore_purchases.update).not.toHaveBeenCalled()
  })

  it.each(['main-client-id', 'custom-client-id'])(
    'ignores an inactive %s client even with the same user ID',
    async (id) => {
      const guild = makeGuild(id)
      getGuildClientMock.mockResolvedValue({ user: { id } })

      await handler.execute(guild as any)

      expect(getMainClientMock).not.toHaveBeenCalled()
      expect(killGuildClientMock).not.toHaveBeenCalled()
      expectCommunityPreserved()
    },
  )

  it('does not destroy shared data when no effective client identity is available', async () => {
    const guild = makeGuild()
    getGuildClientMock.mockResolvedValue({ user: null })

    await handler.execute(guild as any)

    expectCommunityPreserved()
  })

  it('invalidates permissions and logs the event even when an inactive client returns early', async () => {
    const guild = makeGuild()
    getGuildClientMock.mockResolvedValue({ user: null })

    await handler.execute(guild as any)

    expect(invalidatePermissionsMock).toHaveBeenCalledWith({ guildID: 'guild1' })
    expect(gmLogMock).toHaveBeenCalledWith('event', 'Bot left guild: Test Guild')
    expectCommunityPreserved()
  })
})
