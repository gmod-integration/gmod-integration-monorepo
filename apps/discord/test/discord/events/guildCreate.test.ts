import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const updateGuildStatMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ updateGuildStat: updateGuildStatMock }))

const setCachedGuildPreferredLocaleMock = vi.fn()
vi.mock('@gmod/core/utils/guildLocaleCache.js', () => ({
  setCachedGuildPreferredLocale: setCachedGuildPreferredLocaleMock,
}))

const replaceStoredAvatarMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ replaceStoredAvatar: replaceStoredAvatarMock }))

function makeGuild(overrides: any = {}) {
  return {
    id: 'guild1',
    name: 'Test Guild',
    preferredLocale: 'en-US',
    iconURL: vi.fn().mockReturnValue('https://icon.example/avatar.png'),
    ...overrides,
  }
}

describe('guildCreate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCachedGuildPreferredLocaleMock.mockResolvedValue(undefined)
    replaceStoredAvatarMock.mockResolvedValue(undefined)
    updateGuildStatMock.mockResolvedValue(undefined)
  })

  it('logs, caches locale, replaces avatar, and updates guild stats', async () => {
    const mod = await import('../../../src/discord/events/guildCreate.js')
    const guild = makeGuild()

    await mod.default.execute(guild as any)

    expect(gmLogMock).toHaveBeenCalledWith('event', 'Bot joined guild: Test Guild')
    expect(setCachedGuildPreferredLocaleMock).toHaveBeenCalledWith('guild1', 'en-US')
    expect(guild.iconURL).toHaveBeenCalledWith({ extension: 'png', size: 256 })
    expect(replaceStoredAvatarMock).toHaveBeenCalledWith('guild', 'guild1', 'https://icon.example/avatar.png')
    expect(updateGuildStatMock).toHaveBeenCalledWith(guild)
  })

  it('swallows a failing avatar replacement and still updates guild stats', async () => {
    replaceStoredAvatarMock.mockRejectedValue(new Error('minio down'))
    const mod = await import('../../../src/discord/events/guildCreate.js')
    const guild = makeGuild()

    await expect(mod.default.execute(guild as any)).resolves.toBeUndefined()

    expect(updateGuildStatMock).toHaveBeenCalledWith(guild)
  })
})
