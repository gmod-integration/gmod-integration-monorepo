import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getServerFromIDMock = vi.fn()
const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({
  getServerFromID: getServerFromIDMock,
  getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock,
}))

const playerConnectionChartMock = vi.fn()
const playerTeamTimeChatMock = vi.fn()
vi.mock('../../../../src/discord/utils/index.js', () => ({
  playerConnectionChart: playerConnectionChartMock,
  playerTeamTimeChat: playerTeamTimeChatMock,
}))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

let configDiscordMock: any = { embedColor: 0x123456 }
vi.mock('@gmod/config', () => ({
  get ConfigDiscord() {
    return configDiscordMock
  },
}))

const chart = (await import('../../../../src/discord/commands/player/chart.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    user: { id: 'u1' },
    options: {
      getString: vi.fn(),
      getUser: vi.fn(() => null),
      getFocused: vi.fn(),
    },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  } as any
}

function makeServer(overrides: Record<string, any> = {}) {
  return {
    getName: () => 'My Server',
    ...overrides,
  }
}

beforeEach(() => {
  getTranslateMock.mockClear()
  getServerFromIDMock.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
  playerConnectionChartMock.mockReset()
  playerTeamTimeChatMock.mockReset()
  getUserFromDiscordIDMock.mockReset()
  configDiscordMock = { embedColor: 0x123456 }
})

describe('commands/player/chart execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await chart.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('replies server_not_found when the server option is missing', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue(null)
    await chart.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('server_not_found')
  })

  it('replies server_not_found when the server cannot be found', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : null))
    getServerFromIDMock.mockResolvedValueOnce(null)
    await chart.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('server_not_found')
  })

  it('replies stat_not_found when the stat option is missing', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : null))
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    await chart.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('stat_not_found')
  })

  it('replies duration_not_found for an invalid duration', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'kills'
      if (name === 'duration') return 'invalid'
      return null
    })
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    await chart.execute(interaction)
    expect(interaction.reply).toHaveBeenCalledWith('duration_not_found')
  })

  it('replies user_not_verified when steam is absent and the user is not linked', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'kills'
      return null
    })
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    getUserFromDiscordIDMock.mockResolvedValueOnce(null)

    await chart.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('user_not_verified'),
      flags: expect.anything(),
    })
  })

  it('replies user_not_verified when the linked user has no steamID64', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'kills'
      return null
    })
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => null })

    await chart.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('user_not_verified'),
      flags: expect.anything(),
    })
  })

  it('resolves steamID64 from the linked discord user when the steam option is absent', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'kills'
      return null
    })
    const server = makeServer()
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '76561999' })
    playerConnectionChartMock.mockResolvedValueOnce(Buffer.from('chart'))

    await chart.execute(interaction)

    expect(playerConnectionChartMock).toHaveBeenCalledWith(server, '76561999', 'en-US', 'kills', 7)
    expect(interaction.reply).toHaveBeenCalled()
  })

  it('renders the team chart via playerTeamTimeChat with max duration for stat=team', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'team'
      if (name === 'duration') return 'max'
      if (name === 'steam') return '76561'
      return null
    })
    const server = makeServer()
    getServerFromIDMock.mockResolvedValueOnce(server)
    playerTeamTimeChatMock.mockResolvedValueOnce(Buffer.from('team-chart'))

    await chart.execute(interaction)

    expect(playerTeamTimeChatMock).toHaveBeenCalledWith(server, '76561', 'en-US', 0)
    expect(playerConnectionChartMock).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.objectContaining({ name: 'chart.png' })],
      }),
    )
  })

  it('renders a normal chart via playerConnectionChart for a non-team stat with default duration', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'kills'
      if (name === 'steam') return '76561'
      return null
    })
    const server = makeServer()
    getServerFromIDMock.mockResolvedValueOnce(server)
    playerConnectionChartMock.mockResolvedValueOnce(Buffer.from('chart'))

    await chart.execute(interaction)

    expect(playerConnectionChartMock).toHaveBeenCalledWith(server, '76561', 'en-US', 'kills', 7)
    expect(interaction.reply).toHaveBeenCalled()
  })

  it('replies with an error message when chart generation throws', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'stat') return 'kills'
      if (name === 'steam') return '76561'
      return null
    })
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    playerConnectionChartMock.mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await chart.execute(interaction)

    expect(errorSpy).toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith('An error occurred while generating the chart')
    errorSpy.mockRestore()
  })
})

describe('commands/player/chart autocomplete', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await chart.autocomplete(interaction)
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

    await chart.autocomplete(interaction)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'My Server', value: 's1' }])
  })

  it('responds with translated stat choices for the stat option', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'stat', value: 'kill' })), getString: vi.fn() },
    })

    await chart.autocomplete(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'kills', value: 'kills' }])
  })

  it('responds with duration choices, adding max only when stat is team', async () => {
    const interaction = makeInteraction({
      options: {
        getFocused: vi.fn(() => ({ name: 'duration', value: '' })),
        getString: vi.fn(() => 'team'),
      },
    })

    await chart.autocomplete(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([
      { name: '7 days', value: '7' },
      { name: '30 days', value: '30' },
      { name: '90 days', value: '90' },
      { name: 'max', value: 'max' },
    ])
  })

  it('responds with duration choices without max when stat is not team', async () => {
    const interaction = makeInteraction({
      options: {
        getFocused: vi.fn(() => ({ name: 'duration', value: '' })),
        getString: vi.fn(() => 'kills'),
      },
    })

    await chart.autocomplete(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([
      { name: '7 days', value: '7' },
      { name: '30 days', value: '30' },
      { name: '90 days', value: '90' },
    ])
  })

  it('does nothing for an unrecognized focused option', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'user', value: '' })), getString: vi.fn() },
    })

    await chart.autocomplete(interaction)

    expect(interaction.respond).not.toHaveBeenCalled()
  })
})
