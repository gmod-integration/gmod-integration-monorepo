import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock }))

const isGuildPremiumMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ isGuildPremium: isGuildPremiumMock }))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../../../src/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const buttonPremiumMock = vi.fn(async () => ({ toJSON: () => ({ custom_id: 'premium' }) }))
vi.mock('@gmod/domain-guild/discordMessages.js', () => ({ ButtonPremium: buttonPremiumMock }))

const wsAddMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: wsAddMock } }))

const findManyMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_sync_chat: { findMany: findManyMock } } }))

const ensureAvatarStoredMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock }))

const { processDiscordMessageToGmod } = await import('../../../src/models/v3/guildsControllerModels.js')

function makeMessage(overrides: Record<string, any> = {}) {
  return {
    author: { bot: false, id: 'u1', username: 'Bob', displayAvatarURL: () => 'https://avatar.example' },
    guild: { id: 'g1', preferredLocale: 'en' },
    channel: { id: 'ch1' },
    content: 'hello',
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('processDiscordMessageToGmod', () => {
  beforeEach(() => {
    getServersFromDiscordGuildIDMock.mockReset()
    isGuildPremiumMock.mockReset()
    getTranslateMock.mockClear()
    buttonPremiumMock.mockClear()
    wsAddMock.mockReset()
    findManyMock.mockReset()
    ensureAvatarStoredMock.mockReset()
  })

  it('does nothing for bot messages', async () => {
    await processDiscordMessageToGmod(makeMessage({ author: { bot: true } }))
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('does nothing for DM messages (no guild)', async () => {
    await processDiscordMessageToGmod(makeMessage({ guild: null }))
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('does nothing when there is no synced chat channel for this guild/channel pair', async () => {
    findManyMock.mockResolvedValueOnce([])
    await processDiscordMessageToGmod(makeMessage())
    expect(getServersFromDiscordGuildIDMock).not.toHaveBeenCalled()
  })

  it('skips a server without a configured sync chat channel', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    const server = { getSyncChatChannel: vi.fn().mockResolvedValueOnce(null) }
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])

    await processDiscordMessageToGmod(makeMessage())

    expect(wsAddMock).not.toHaveBeenCalled()
  })

  it('skips a server whose sync direction is gmodToDiscord-only', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    const server = {
      getSyncChatChannel: vi.fn().mockResolvedValueOnce({}),
      getSetting: vi.fn().mockResolvedValueOnce('gmodToDiscord'),
    }
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])

    await processDiscordMessageToGmod(makeMessage())

    expect(wsAddMock).not.toHaveBeenCalled()
  })

  it('replies with a premium-required prompt and returns when the guild is not premium', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    const server = {
      getSyncChatChannel: vi.fn().mockResolvedValueOnce({}),
      getSetting: vi.fn().mockResolvedValueOnce('both'),
      getID: () => 's1',
    }
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
    isGuildPremiumMock.mockResolvedValueOnce(false)
    const message = makeMessage()

    await processDiscordMessageToGmod(message)

    expect(message.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'premium_required' }),
    )
    expect(wsAddMock).not.toHaveBeenCalled()
  })

  it('pushes a wsPlayerSay update for a premium guild', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    const server = {
      getSyncChatChannel: vi.fn().mockResolvedValueOnce({}),
      getSetting: vi.fn().mockResolvedValueOnce('both'),
      getID: () => 's1',
    }
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([server])
    isGuildPremiumMock.mockResolvedValueOnce(true)
    ensureAvatarStoredMock.mockResolvedValueOnce('stored-avatar-url')

    await processDiscordMessageToGmod(makeMessage())

    expect(wsAddMock).toHaveBeenCalledWith(
      'wsSendToServer',
      expect.objectContaining({
        id: 's1',
        data: expect.objectContaining({ method: 'wsPlayerSay', name: 'Bob', content: 'hello', avatar: 'stored-avatar-url' }),
      }),
    )
  })
})
