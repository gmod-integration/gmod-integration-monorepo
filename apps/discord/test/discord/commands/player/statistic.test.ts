import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerListMock = vi.fn()
vi.mock('@gmod/domain-server/serversModels.js', () => ({ getServerList: getServerListMock }))

const getUserStatisticMessageMock = vi.fn(async () => ({ content: 'stats' }))
vi.mock('../../../../src/discord/utils/messages.js', () => ({ getUserStatisticMessage: getUserStatisticMessageMock }))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const statistic = (await import('../../../../src/discord/commands/player/statistic.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US' },
    user: { id: 'u1' },
    options: {
      getUser: vi.fn(() => null),
      getString: vi.fn(() => null),
      getFocused: vi.fn(),
    },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  } as any
}

beforeEach(() => {
  getServerListMock.mockReset()
  getUserStatisticMessageMock.mockClear()
  getTranslateMock.mockClear()
})

describe('commands/player/statistic execute', () => {
  it('defaults to the invoking user and forwards options to getUserStatisticMessage', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockImplementation((name: string) => (name === 'server' ? 's1' : null))

    await statistic.execute(interaction)

    expect(getUserStatisticMessageMock).toHaveBeenCalledWith(interaction.user, 's1', interaction.guild, null)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'stats' })
  })

  it('uses the provided user and steamid options', async () => {
    const interaction = makeInteraction()
    const targetUser = { id: 'target1' }
    interaction.options.getUser.mockReturnValue(targetUser)
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'server') return 's1'
      if (name === 'steamid') return '76561'
      return null
    })

    await statistic.execute(interaction)

    expect(getUserStatisticMessageMock).toHaveBeenCalledWith(targetUser, 's1', interaction.guild, '76561')
  })
})

describe('commands/player/statistic autocomplete', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await statistic.autocomplete(interaction)
    expect(result).toBeUndefined()
    expect(getServerListMock).not.toHaveBeenCalled()
  })

  it('seeds a global_stat choice and responds with the mapped filtered choices', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'server', value: '' })) },
    })
    getServerListMock.mockImplementation(async (_interaction, _focused, choices) => {
      choices['Server One'] = 's1'
      return Object.keys(choices)
    })

    await statistic.autocomplete(interaction)

    expect(getTranslateMock).toHaveBeenCalledWith('global_stat', 'en-US')
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'global_stat', value: 'global' },
      { name: 'Server One', value: 's1' },
    ])
  })
})
