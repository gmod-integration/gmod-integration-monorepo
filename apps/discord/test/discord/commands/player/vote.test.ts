import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getServerListMock = vi.fn()
vi.mock('@gmod/domain-server/serversModels.js', () => ({ getServerList: getServerListMock }))

const secToTimeMock = vi.fn(() => '1h')
vi.mock('../../../../src/discord/utils/index.js', () => ({ secToTime: secToTimeMock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const prismaMock = {
  gm_server_vote: { findFirst: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const vote = (await import('../../../../src/discord/commands/player/vote.js')).default

function makeInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: 'g1', preferredLocale: 'en-US', channels: { cache: new Map() } },
    user: { id: 'u1', username: 'Voter' },
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
  getServerListMock.mockReset()
  secToTimeMock.mockClear()
  getServerFromIDMock.mockReset()
  prismaMock.gm_server_vote.findFirst.mockReset()
  prismaMock.gm_server_vote.create.mockReset()
})

describe('commands/player/vote execute', () => {
  it('returns early when there is no guild', async () => {
    const interaction = makeInteraction({ guild: null })
    const result = await vote.execute(interaction)
    expect(result).toBeUndefined()
  })

  it('returns early when the server option is missing', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue(null)
    const result = await vote.execute(interaction)
    expect(result).toBeUndefined()
    expect(prismaMock.gm_server_vote.findFirst).not.toHaveBeenCalled()
  })

  it('replies vote_cooldown when the last vote is still within the cooldown window', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce({ createdAt: new Date() })

    await vote.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'vote_cooldown', ephemeral: true })
    expect(prismaMock.gm_server_vote.create).not.toHaveBeenCalled()
  })

  it('proceeds with a new vote when the last vote is outside the cooldown window', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    const oldVoteDate = new Date(Date.now() - 1000 * 60 * 60 * 4)
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce({ createdAt: oldVoteDate })
    getServerFromIDMock.mockResolvedValueOnce(null)

    await vote.execute(interaction)

    expect(prismaMock.gm_server_vote.create).toHaveBeenCalledWith({
      data: { serverID: 's1', userID: 'u1' },
    })
  })

  it('replies server_not_found when there was never a previous vote and the server cannot be found', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce(null)
    getServerFromIDMock.mockResolvedValueOnce(null)

    await vote.execute(interaction)

    expect(prismaMock.gm_server_vote.create).toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
  })

  it('replies vote_success without notifying a channel when there is no vote webhook configured', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce(null)
    const serverData = { name: 'My Server', getVoteChannel: vi.fn().mockResolvedValue(null) }
    getServerFromIDMock.mockResolvedValueOnce(serverData)

    await vote.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })

  it('sends a webhook notification to the configured text-based channel and replies vote_success', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce(null)
    const sendMock = vi.fn()
    const channel = { isTextBased: () => true, send: sendMock }
    interaction.guild.channels.cache.set('c1', channel)
    const serverData = {
      name: 'My Server',
      getVoteChannel: vi.fn().mockResolvedValue({ channelID: 'c1' }),
    }
    getServerFromIDMock.mockResolvedValueOnce(serverData)

    await vote.execute(interaction)

    expect(sendMock).toHaveBeenCalledWith({ content: 'vote_webhook' })
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })

  it('skips the webhook notification when the configured channel is not text-based', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce(null)
    const channel = { isTextBased: () => false, send: vi.fn() }
    interaction.guild.channels.cache.set('c1', channel)
    const serverData = {
      name: 'My Server',
      getVoteChannel: vi.fn().mockResolvedValue({ channelID: 'c1' }),
    }
    getServerFromIDMock.mockResolvedValueOnce(serverData)

    await vote.execute(interaction)

    expect(channel.send).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })

  it('skips the webhook notification when the configured channel is not found in the cache', async () => {
    const interaction = makeInteraction()
    interaction.options.getString.mockReturnValue('s1')
    prismaMock.gm_server_vote.findFirst.mockResolvedValueOnce(null)
    const serverData = {
      name: 'My Server',
      getVoteChannel: vi.fn().mockResolvedValue({ channelID: 'missing-channel' }),
    }
    getServerFromIDMock.mockResolvedValueOnce(serverData)

    await vote.execute(interaction)

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })
})

describe('commands/player/vote autocomplete', () => {
  it('responds with the mapped filtered choices', async () => {
    const interaction = makeInteraction({
      options: { getFocused: vi.fn(() => ({ name: 'server', value: 's' })) },
    })
    getServerListMock.mockImplementation(async (_interaction, _focused, choices) => {
      choices['Server One'] = 's1'
      return ['Server One']
    })

    await vote.autocomplete(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'Server One', value: 's1' }])
  })
})
