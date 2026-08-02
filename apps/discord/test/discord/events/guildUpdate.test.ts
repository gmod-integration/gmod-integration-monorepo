import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const updateGuildStatMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ updateGuildStat: updateGuildStatMock }))

const setCachedGuildPreferredLocaleMock = vi.fn()
vi.mock('@gmod/core/utils/guildLocaleCache.js', () => ({
  setCachedGuildPreferredLocale: setCachedGuildPreferredLocaleMock,
}))

const deleteStoredAvatarMock = vi.fn()
const replaceStoredAvatarMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({
  deleteStoredAvatar: deleteStoredAvatarMock,
  replaceStoredAvatar: replaceStoredAvatarMock,
}))

function makeGuild(overrides: any = {}) {
  return {
    id: 'guild1',
    icon: 'icon-hash',
    name: 'Test Guild',
    preferredLocale: 'en-US',
    iconURL: vi.fn().mockReturnValue('https://icon.example/avatar.png'),
    ...overrides,
  }
}

describe('guildUpdate event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCachedGuildPreferredLocaleMock.mockResolvedValue(undefined)
    updateGuildStatMock.mockResolvedValue(undefined)
    replaceStoredAvatarMock.mockResolvedValue(undefined)
    deleteStoredAvatarMock.mockResolvedValue(undefined)
  })

  it('returns early when nothing relevant changed', async () => {
    const mod = await import('../../../src/discord/events/guildUpdate.js')
    const oldGuild = makeGuild()
    const newGuild = makeGuild()

    await mod.default.execute(oldGuild as any, newGuild as any)

    expect(gmLogMock).not.toHaveBeenCalled()
    expect(setCachedGuildPreferredLocaleMock).not.toHaveBeenCalled()
    expect(updateGuildStatMock).not.toHaveBeenCalled()
  })

  it('replaces the stored avatar when the icon changed to a new non-null icon', async () => {
    const mod = await import('../../../src/discord/events/guildUpdate.js')
    const oldGuild = makeGuild({ icon: 'old-icon' })
    const newGuild = makeGuild({ icon: 'new-icon' })

    await mod.default.execute(oldGuild as any, newGuild as any)

    expect(gmLogMock).toHaveBeenCalledWith('event', 'Guild icon changed for guild1')
    expect(newGuild.iconURL).toHaveBeenCalledWith({ extension: 'png', size: 256 })
    expect(replaceStoredAvatarMock).toHaveBeenCalledWith('guild', 'guild1', 'https://icon.example/avatar.png')
    expect(deleteStoredAvatarMock).not.toHaveBeenCalled()
    // Icon-only change shouldn't touch the locale cache or guild stats.
    expect(setCachedGuildPreferredLocaleMock).not.toHaveBeenCalled()
    expect(updateGuildStatMock).not.toHaveBeenCalled()
  })

  it('deletes the stored avatar when the icon changed to null', async () => {
    const mod = await import('../../../src/discord/events/guildUpdate.js')
    const oldGuild = makeGuild({ icon: 'old-icon' })
    const newGuild = makeGuild({ icon: null })

    await mod.default.execute(oldGuild as any, newGuild as any)

    expect(deleteStoredAvatarMock).toHaveBeenCalledWith('guild', 'guild1')
    expect(replaceStoredAvatarMock).not.toHaveBeenCalled()
  })

  it('swallows a failing avatar replacement', async () => {
    replaceStoredAvatarMock.mockRejectedValue(new Error('minio down'))
    const mod = await import('../../../src/discord/events/guildUpdate.js')
    const oldGuild = makeGuild({ icon: 'old-icon' })
    const newGuild = makeGuild({ icon: 'new-icon' })

    await expect(mod.default.execute(oldGuild as any, newGuild as any)).resolves.toBeUndefined()
  })

  it('logs and syncs when only the name changed', async () => {
    const mod = await import('../../../src/discord/events/guildUpdate.js')
    const oldGuild = makeGuild({ name: 'Old Name' })
    const newGuild = makeGuild({ name: 'New Name' })

    await mod.default.execute(oldGuild as any, newGuild as any)

    expect(gmLogMock).toHaveBeenCalledWith('event', 'Guild name changed from Old Name to New Name')
    expect(replaceStoredAvatarMock).not.toHaveBeenCalled()
    expect(deleteStoredAvatarMock).not.toHaveBeenCalled()
    expect(setCachedGuildPreferredLocaleMock).toHaveBeenCalledWith('guild1', 'en-US')
    expect(updateGuildStatMock).toHaveBeenCalledWith(newGuild)
  })

  it('logs and syncs when only the locale changed', async () => {
    const mod = await import('../../../src/discord/events/guildUpdate.js')
    const oldGuild = makeGuild({ preferredLocale: 'en-US' })
    const newGuild = makeGuild({ preferredLocale: 'fr-FR' })

    await mod.default.execute(oldGuild as any, newGuild as any)

    expect(gmLogMock).toHaveBeenCalledWith('event', 'Guild locale changed from en-US to fr-FR')
    expect(setCachedGuildPreferredLocaleMock).toHaveBeenCalledWith('guild1', 'fr-FR')
    expect(updateGuildStatMock).toHaveBeenCalledWith(newGuild)
  })
})
