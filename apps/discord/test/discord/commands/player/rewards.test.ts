import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ scope: vi.fn(), user: vi.fn(), rewards: vi.fn(), choices: vi.fn() }))
vi.mock('@gmod/core/models/v3/discordServerScope.js', () => ({ getDiscordCommunityServer: mocks.scope }))
vi.mock('@gmod/core/models/v6/rewards.js', () => ({ getPlayerRewards: mocks.rewards }))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: mocks.user }))
vi.mock('@gmod/domain-server/serversModels.js', () => ({ getServerList: mocks.choices }))
vi.mock('@gmod/core/utils/localizations.js', () => ({
  getTranslate: vi.fn(async (key: string, _locale: string, values?: string[]) => [key, ...(values ?? [])].join(' ')),
}))
const command = (await import('../../../../src/discord/commands/player/rewards.js')).default
const interaction = (overrides: Record<string, unknown> = {}) =>
  ({
    guild: { id: 'guild', preferredLocale: 'fr' },
    user: { id: 'owner' },
    options: { getString: () => 'server', getInteger: () => null, getFocused: () => ({ value: '' }) },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    respond: vi.fn(),
    ...overrides,
  }) as any
const reward = (id = 'rule') => ({
  rule: {
    id,
    name: 'Bienvenue',
    description: 'Merci !',
    trigger: { type: 'playtime', seconds: 3600 },
    actions: [{ type: 'darkrp_money', amount: 5000 }],
  },
  simulation: { eligible: true, playedSeconds: 1800 },
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.scope.mockResolvedValue({ name: 'My server' })
  mocks.user.mockResolvedValue({ getSteamID64: () => '76561198000000000' })
  mocks.rewards.mockResolvedValue({ rewards: [reward()], history: [] })
})
describe('/rewards', () => {
  it('keeps personal progress private and reads only the invoking player on the authorized server', async () => {
    const request = interaction()
    await command.execute(request)
    expect(request.deferReply).toHaveBeenCalledWith({ flags: expect.anything() })
    expect(mocks.scope).toHaveBeenCalledExactlyOnceWith('server', 'guild')
    expect(mocks.user).toHaveBeenCalledExactlyOnceWith('owner')
    expect(mocks.rewards).toHaveBeenCalledExactlyOnceWith('server', '76561198000000000')
    expect(request.editReply.mock.calls[0][0].embeds[0].data.fields[0].value).toContain('rewards_progress 0,5 1')
    expect(request.editReply.mock.calls[0][0].allowedMentions).toEqual({ parse: [] })
  })
  it('rejects a foreign server before looking up any player or history', async () => {
    mocks.scope.mockResolvedValue(null)
    const request = interaction()
    await command.execute(request)
    expect(mocks.user).not.toHaveBeenCalled()
    expect(mocks.rewards).not.toHaveBeenCalled()
    expect(request.editReply).toHaveBeenCalledWith({ content: 'server_not_found' })
  })
  it('explains missing linkage without reading rewards', async () => {
    mocks.user.mockResolvedValue(null)
    const request = interaction()
    await command.execute(request)
    expect(mocks.rewards).not.toHaveBeenCalled()
    expect(request.editReply).toHaveBeenCalledWith({ content: 'rewards_link_required' })
  })
  it('shows actual delivery status instead of treating eligibility as successful delivery', async () => {
    mocks.rewards.mockResolvedValue({ rewards: [reward()], history: [{ ruleID: 'rule', status: 'uncertain' }] })
    const request = interaction()
    await command.execute(request)
    expect(request.editReply.mock.calls[0][0].embeds[0].data.fields[0].value).toContain('rewards_status_uncertain')
  })
  it('bounds embed size and lets players select subsequent pages', async () => {
    mocks.rewards.mockResolvedValue({
      rewards: Array.from({ length: 12 }, (_, index) => reward(`rule${index}`)),
      history: [],
    })
    const request = interaction()
    request.options.getInteger = () => 2
    await command.execute(request)
    const embed = request.editReply.mock.calls[0][0].embeds[0].data
    expect(embed.fields).toHaveLength(5)
    expect(embed.footer.text).toBe('rewards_page 2 3')
  })
  it('shows a Lua reward without exposing server source or requiring an economy amount', async () => {
    const item = reward()
    mocks.rewards.mockResolvedValue({
      rewards: [{ ...item, rule: { ...item.rule, actions: [{ type: 'lua', code: 'local private = "server-code"' }] } }],
      history: [],
    })
    const request = interaction()
    await command.execute(request)
    const reply = request.editReply.mock.calls[0][0]
    expect(reply.embeds[0].data.fields[0].value).toContain('rewards_action_lua')
    expect(JSON.stringify(reply)).not.toContain('server-code')
    expect(reply.content).toBeUndefined()
  })
  it('shows unavailable data as an error and never exposes provider details', async () => {
    mocks.rewards.mockRejectedValue(new Error('database credentials'))
    const request = interaction()
    await command.execute(request)
    expect(request.editReply).toHaveBeenCalledWith({ content: 'rewards_unavailable' })
  })
  it('ignores DMs and caps autocomplete to25 community-scoped entries', async () => {
    await command.execute(interaction({ guild: null }))
    expect(mocks.scope).not.toHaveBeenCalled()
    mocks.choices.mockImplementation(async (_a, _b, choices) => {
      for (let index = 0; index < 40; index++) choices[`Server${index}`] = String(index)
      return Object.keys(choices)
    })
    const request = interaction()
    await command.autocomplete(request)
    expect(request.respond.mock.calls[0][0]).toHaveLength(25)
  })
  it('ignores a missing server option and autocomplete outside a guild', async () => {
    const request = interaction()
    request.options.getString = () => null
    await command.execute(request)
    await command.autocomplete(interaction({ guild: null }))
    expect(request.deferReply).not.toHaveBeenCalled()
    expect(mocks.scope).not.toHaveBeenCalled()
    expect(mocks.choices).not.toHaveBeenCalled()
  })
  it('explains when no rewards are configured', async () => {
    mocks.rewards.mockResolvedValue({ rewards: [], history: [] })
    const request = interaction()
    await command.execute(request)
    expect(request.editReply).toHaveBeenCalledWith({ content: 'rewards_empty' })
  })
  it.each(['manual', 'locked'] as const)('shows %s progress without a history entry or description', async (status) => {
    const item = reward()
    mocks.rewards.mockResolvedValue({
      rewards: [
        {
          ...item,
          rule: {
            ...item.rule,
            description: '',
            trigger: status === 'manual' ? { type: 'manual' } : item.rule.trigger,
            actions: [{ type: 'discord_role', roleID: '223456789012345678' }],
          },
          simulation: { eligible: false, playedSeconds: 0 },
        },
      ],
      history: [],
    })
    const request = interaction()
    await command.execute(request)
    const value = request.editReply.mock.calls[0][0].embeds[0].data.fields[0].value
    expect(value).toContain(`rewards_status_${status}`)
    expect(value).toContain('rewards_action_discord_role 223456789012345678')
    if (status === 'manual') expect(value).not.toContain('rewards_progress')
  })
})
