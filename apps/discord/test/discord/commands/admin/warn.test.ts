import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getServerListMock = vi.fn()
vi.mock('@gmod/domain-server/serversModels.js', () => ({ getServerList: getServerListMock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const buttonVerificationWebsiteMock = vi.fn(async () => ({ type: 'button' }))
vi.mock('../../../../src/discord/utils/buttons.js', () => ({ ButtonVerificationWebsite: buttonVerificationWebsiteMock }))

const getWarnMessageEmbedMock = vi.fn()
const saveWarnListOptionsMock = vi.fn()
vi.mock('@gmod/domain-moderation/warnModels.js', () => ({
  getWarnMessageEmbed: getWarnMessageEmbedMock,
  saveWarnListOptions: saveWarnListOptionsMock,
}))

const warn = (await import('../../../../src/discord/commands/admin/warn.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    user: { id: 'u1' },
    options: {
      getString: vi.fn(),
      getUser: vi.fn(() => null),
    },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getTranslateMock.mockClear()
  getServerListMock.mockReset()
  getServerFromIDMock.mockReset()
  getUserFromDiscordIDMock.mockReset()
  buttonVerificationWebsiteMock.mockClear()
  getWarnMessageEmbedMock.mockReset()
  saveWarnListOptionsMock.mockReset()
})

describe('commands/admin/warn execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await warn.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('replies server_not_found when the server cannot be found', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    getServerFromIDMock.mockResolvedValueOnce(null)
    await warn.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
  })

  it('returns an unverified reply payload when steam is not provided and member has no linked steamID64', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : null))
    getServerFromIDMock.mockResolvedValueOnce({ getID: () => 's1' })
    getUserFromDiscordIDMock.mockResolvedValueOnce(null)

    const result = await warn.execute(interaction)

    expect(result).toEqual(
      expect.objectContaining({
        content: 'user_not_verified\n_ _',
        ephemeral: true,
      }),
    )
    expect(getWarnMessageEmbedMock).not.toHaveBeenCalled()
  })

  it('returns an unverified reply payload when the linked user has no steamID64', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : null))
    getServerFromIDMock.mockResolvedValueOnce({ getID: () => 's1' })
    getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => null })

    const result = await warn.execute(interaction)

    expect(result).toEqual(expect.objectContaining({ ephemeral: true }))
  })

  it('resolves steamID64 from the linked discord member when steam option is absent', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : null))
    const server = { getID: () => 's1' }
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '76561111' })
    getWarnMessageEmbedMock.mockResolvedValueOnce({ embed: 'e', component: 'c', options: { limit: 10 } })
    const reply = vi.fn().mockResolvedValue({ id: 'msg1' })
    interaction.reply = reply

    await warn.execute(interaction)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getWarnMessageEmbedMock).toHaveBeenCalledWith(server, '76561111', 'en-US')
    expect(reply).toHaveBeenCalledWith({ embeds: ['e'], components: ['c'], fetchReply: true })
    expect(saveWarnListOptionsMock).toHaveBeenCalledWith('msg1', 's1', '76561111', { limit: 10 })
  })

  it('uses the provided steam option directly, skipping the discord lookup', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'steam') return '76561122'
      return null
    })
    const server = { getID: () => 's1' }
    getServerFromIDMock.mockResolvedValueOnce(server)
    getWarnMessageEmbedMock.mockResolvedValueOnce({ embed: 'e', component: 'c', options: {} })
    const reply = vi.fn().mockResolvedValue({ id: 'msg2' })
    interaction.reply = reply

    await warn.execute(interaction)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
    expect(getWarnMessageEmbedMock).toHaveBeenCalledWith(server, '76561122', 'en-US')
    expect(saveWarnListOptionsMock).toHaveBeenCalledWith('msg2', 's1', '76561122', {})
  })
})

describe('commands/admin/warn autocomplete', () => {
  it('responds with the mapped filtered choices', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'server', value: 's' })) },
    })
    getServerListMock.mockImplementation(async (_interaction, _focused, choices) => {
      choices['Server One'] = 's1'
      return ['Server One']
    })

    await warn.autocomplete(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'Server One', value: 's1' }])
  })
})
