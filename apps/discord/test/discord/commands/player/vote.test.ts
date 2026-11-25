import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))
const getServerListMock = vi.fn()
vi.mock('@gmod/domain-server/serversModels.js', () => ({ getServerList: getServerListMock }))
vi.mock('../../../../src/discord/utils/index.js', () => ({ secToTime: vi.fn(() => '1h') }))
const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))
const registerVote = vi.fn()
vi.mock('@gmod/core/models/v3/serverVoteModels.js', () => ({ registerCommunityServerVote: registerVote }))
const vote = (await import('../../../../src/discord/commands/player/vote.js')).default
const server = (overrides = {}) => ({
  name: 'My Server',
  getGuildID: () => 'g1',
  getVoteChannel: vi.fn().mockResolvedValue(null),
  ...overrides,
})
const interaction = (overrides = {}) =>
  ({
    guild: { id: 'g1', preferredLocale: 'en-US', channels: { cache: new Map() } },
    user: { id: 'u1', username: 'Voter' },
    options: { getString: vi.fn(() => 's1'), getFocused: vi.fn(() => ({ name: 'server', value: '' })) },
    reply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  }) as any
beforeEach(() => {
  vi.resetAllMocks()
  getTranslateMock.mockImplementation(async (key: string) => key)
  getServerFromIDMock.mockResolvedValue(server())
  registerVote.mockResolvedValue({ status: 'voted' })
})
describe('community server votes', () => {
  it('does not process direct messages or a missing server', async () => {
    await vote.execute(interaction({ guild: null }))
    await vote.execute(interaction({ options: { getString: () => null } }))
    expect(getServerFromIDMock).not.toHaveBeenCalled()
    expect(registerVote).not.toHaveBeenCalled()
  })
  it.each([
    null,
    server({ getGuildID: () => 'other', isPublic: false }),
    server({ getGuildID: () => 'other', isPublic: true }),
  ])('rejects an unavailable or foreign server before registering any vote: %j', async (target) => {
    getServerFromIDMock.mockResolvedValueOnce(target)
    const command = interaction()
    await vote.execute(command)
    expect(registerVote).not.toHaveBeenCalled()
    expect(command.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
  })
  it('propagates the transactional cooldown without querying a notification channel', async () => {
    const target = server()
    getServerFromIDMock.mockResolvedValueOnce(target)
    registerVote.mockResolvedValueOnce({ status: 'cooldown', retryAfterSeconds: 3600 })
    const command = interaction()
    await vote.execute(command)
    expect(registerVote).toHaveBeenCalledWith('s1', 'g1', 'u1')
    expect(command.reply).toHaveBeenCalledWith({ content: 'vote_cooldown', ephemeral: true })
    expect(target.getVoteChannel).not.toHaveBeenCalled()
  })
  it('fails closed if the server changed community before the transactional write', async () => {
    const target = server()
    getServerFromIDMock.mockResolvedValueOnce(target)
    registerVote.mockResolvedValueOnce({ status: 'not_found' })
    const command = interaction()
    await vote.execute(command)
    expect(command.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
    expect(target.getVoteChannel).not.toHaveBeenCalled()
  })
  it('confirms the saved vote when no notification is configured', async () => {
    const command = interaction()
    await vote.execute(command)
    expect(command.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })
  it('notifies only the channel resolved within the current Discord community', async () => {
    const target = server({ getVoteChannel: vi.fn().mockResolvedValue({ channelID: 'c1' }) })
    getServerFromIDMock.mockResolvedValueOnce(target)
    const command = interaction()
    const send = vi.fn().mockResolvedValue(undefined)
    command.guild.channels.cache.set('c1', { isTextBased: () => true, send })
    await vote.execute(command)
    expect(send).toHaveBeenCalledWith({ content: 'vote_webhook', allowedMentions: { parse: [] } })
    expect(command.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })
  it('does not turn a notification failure into a failed vote or an unhandled promise', async () => {
    getServerFromIDMock.mockResolvedValueOnce(
      server({ getVoteChannel: vi.fn().mockResolvedValue({ channelID: 'c1' }) }),
    )
    const command = interaction()
    command.guild.channels.cache.set('c1', {
      isTextBased: () => true,
      send: vi.fn().mockRejectedValueOnce(new Error('Discord unavailable')),
    })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await vote.execute(command)
    expect(command.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
    expect(warning).toHaveBeenCalledWith('Vote saved; Discord notification unavailable.')
    warning.mockRestore()
  })

  it.each([false, 'missing'])('skips a missing or non-text notification channel: %s', async (mode) => {
    getServerFromIDMock.mockResolvedValueOnce(
      server({ getVoteChannel: vi.fn().mockResolvedValue({ channelID: 'c1' }) }),
    )
    const command = interaction()
    const send = vi.fn()
    if (mode === false) command.guild.channels.cache.set('c1', { isTextBased: () => false, send })
    await vote.execute(command)
    expect(send).not.toHaveBeenCalled()
    expect(command.reply).toHaveBeenCalledWith({ content: 'vote_success', ephemeral: true })
  })
  it('bounds autocomplete choices to Discord’s maximum and does not autocomplete in DMs', async () => {
    await vote.autocomplete(interaction({ guild: null }))
    expect(getServerListMock).not.toHaveBeenCalled()
    getServerListMock.mockImplementation(async (_interaction, _focused, choices) => {
      for (let i = 0; i < 40; i++) choices[`Server ${i}`] = `s${i}`
      return Object.keys(choices)
    })
    const command = interaction()
    await vote.autocomplete(command)
    expect(command.respond.mock.calls[0][0]).toHaveLength(25)
  })
})
