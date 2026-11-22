import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ensureAvatarStoredMock = vi.fn()
const getUserSummaryMock = vi.fn()

vi.mock('steamapi', () => ({
  default: vi.fn().mockImplementation(function (this: any, apiKey: string) {
    this.__apiKey = apiKey
    this.getUserSummary = getUserSummaryMock
  }),
}))

vi.mock('@gmod/config', () => ({ ConfigSteam: { apiKey: 'test-steam-api-key' } }))
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock }))

describe('packages/infra-steam src/index.ts', () => {
  beforeEach(() => {
    getUserSummaryMock.mockReset()
    ensureAvatarStoredMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getSteamApi() returns the same underlying client every call', async () => {
    const { getSteamApi } = await import('../src/index.js')

    expect(getSteamApi()).toBe(getSteamApi())
  })

  it('getSteamUserSummary() resolves with the Steam API summary', async () => {
    const summary = { steamID: 'abc', avatar: { large: 'https://example.com/avatar.jpg' } }
    getUserSummaryMock.mockResolvedValue(summary)

    const { getSteamUserSummary } = await import('../src/index.js')
    await expect(getSteamUserSummary('76561198219049673')).resolves.toBe(summary)
    expect(getUserSummaryMock).toHaveBeenCalledWith('76561198219049673')
  })

  it('getSteamUserAvatars() resolves with just the avatar object', async () => {
    const summary = { avatar: { small: 'a', medium: 'b', large: 'c' } }
    getUserSummaryMock.mockResolvedValue(summary)

    const { getSteamUserAvatars } = await import('../src/index.js')
    await expect(getSteamUserAvatars('76561198219049673')).resolves.toBe(summary.avatar)
  })

  it('getSteamUserAvatarLarge() caches the large avatar via ensureAvatarStored', async () => {
    const summary = { avatar: { large: 'https://steamcdn.example.com/large.jpg' } }
    getUserSummaryMock.mockResolvedValue(summary)
    ensureAvatarStoredMock.mockResolvedValue('https://gmod-integration.com/avatars/steam/76561198219049673')

    const { getSteamUserAvatarLarge } = await import('../src/index.js')
    const result = await getSteamUserAvatarLarge('76561198219049673')

    expect(ensureAvatarStoredMock).toHaveBeenCalledWith(
      'steam',
      '76561198219049673',
      'https://steamcdn.example.com/large.jpg',
    )
    expect(result).toBe('https://gmod-integration.com/avatars/steam/76561198219049673')
  })

  it.each(['getSteamUserSummary', 'getSteamUserAvatars', 'getSteamUserAvatarLarge'] as const)(
    '%s rejects when Steam fails instead of leaving the caller pending',
    async (helper) => {
      const unavailable = new Error('Steam unavailable')
      getUserSummaryMock.mockRejectedValueOnce(unavailable)
      const module = await import('../src/index.js')

      await expect(module[helper]('76561198219049673')).rejects.toBe(unavailable)
      expect(ensureAvatarStoredMock).not.toHaveBeenCalled()
    },
  )

  it('rejects an avatar-storage failure so delivery callers can handle it', async () => {
    const unavailable = new Error('Avatar storage unavailable')
    getUserSummaryMock.mockResolvedValueOnce({ avatar: { large: 'https://steamcdn.example.com/large.jpg' } })
    ensureAvatarStoredMock.mockRejectedValueOnce(unavailable)
    const { getSteamUserAvatarLarge } = await import('../src/index.js')

    await expect(getSteamUserAvatarLarge('76561198219049673')).rejects.toBe(unavailable)
  })
})
