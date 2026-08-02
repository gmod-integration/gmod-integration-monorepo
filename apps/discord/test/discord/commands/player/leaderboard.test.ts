import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getLeaderboardButtonsMock = vi.fn(() => 'buttons-row')
const getLeaderboardMessageEmbedMock = vi.fn()
const getServerLeaderboardCategoriesMock = vi.fn()
const saveLeaderboardOptionsMock = vi.fn()
vi.mock('@gmod/core/models/v3/leaderboardModels.js', () => ({
  getLeaderboardButtons: getLeaderboardButtonsMock,
  getLeaderboardMessageEmbed: getLeaderboardMessageEmbedMock,
  getServerLeaderboardCategories: getServerLeaderboardCategoriesMock,
  saveLeaderboardOptions: saveLeaderboardOptionsMock,
}))

const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock }))

const leaderboard = (await import('../../../../src/discord/commands/player/leaderboard.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    options: {
      getString: vi.fn(),
      getFocused: vi.fn(),
    },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getTranslateMock.mockClear()
  getLeaderboardButtonsMock.mockClear()
  getLeaderboardMessageEmbedMock.mockReset()
  getServerLeaderboardCategoriesMock.mockReset()
  saveLeaderboardOptionsMock.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
})

describe('commands/player/leaderboard execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await leaderboard.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('replies with a failure message when leaderboard data cannot be retrieved', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue(null)
    getLeaderboardMessageEmbedMock.mockResolvedValueOnce(null)

    await leaderboard.execute(interaction)

    expect(getLeaderboardMessageEmbedMock).toHaveBeenCalledWith(null, 'total_time', 'en-US')
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Failed to retrieve leaderboard data.', ephemeral: true })
  })

  it('replies with the embed and buttons and saves leaderboard options on success', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'category') return 'kills'
      return null
    })
    const options = { page: 1, totalPages: 3 }
    getLeaderboardMessageEmbedMock.mockResolvedValueOnce({ embed: 'e1', options })
    const reply = vi.fn().mockResolvedValue({ id: 'msg1' })
    interaction.reply = reply

    await leaderboard.execute(interaction)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getLeaderboardMessageEmbedMock).toHaveBeenCalledWith('s1', 'kills', 'en-US')
    expect(getLeaderboardButtonsMock).toHaveBeenCalledWith(true, false)
    expect(reply).toHaveBeenCalledWith({
      embeds: ['e1'],
      components: ['buttons-row'],
      fetchReply: true,
    })
    expect(saveLeaderboardOptionsMock).toHaveBeenCalledWith('msg1', options)
  })
})

describe('commands/player/leaderboard autocomplete', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await leaderboard.autocomplete(interaction)
    expect(result).toBeUndefined()
  })

  it('responds with matching servers for the server option', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'server', value: 'My' })), getString: vi.fn() },
    })
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([
      { id: 's1', name: 'My Server' },
      { id: 's2', name: 'Other' },
    ])

    await leaderboard.autocomplete(interaction)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'My Server', value: 's1' }])
  })

  it('returns early for category focus when no server is selected yet', async () => {
    const interaction = makeInteraction({
      options: {
        getFocused: vi.fn(() => ({ name: 'category', value: '' })),
        getString: vi.fn(() => null),
      },
    })

    const result = await leaderboard.autocomplete(interaction)

    expect(result).toBeUndefined()
    expect(getServerLeaderboardCategoriesMock).not.toHaveBeenCalled()
  })

  it('responds with translated matching categories', async () => {
    const interaction = makeInteraction({
      options: {
        getFocused: vi.fn(() => ({ name: 'category', value: 'kil' })),
        getString: vi.fn(() => 's1'),
      },
    })
    getServerLeaderboardCategoriesMock.mockResolvedValueOnce(['kills', 'deaths'])

    await leaderboard.autocomplete(interaction)

    expect(getServerLeaderboardCategoriesMock).toHaveBeenCalledWith('s1')
    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'kills', value: 'kills' }])
  })

  it('does nothing for an unrecognized focused option', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'other', value: '' })), getString: vi.fn() },
    })

    await leaderboard.autocomplete(interaction)

    expect(interaction.respond).not.toHaveBeenCalled()
  })
})
