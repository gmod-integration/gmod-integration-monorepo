import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), server: vi.fn(), client: vi.fn(), add: vi.fn() }))
vi.mock('@gmod/core/models/v6/rewards.js', () => ({ authorizeDiscordRewardAction: mocks.authorize }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: mocks.server }))
vi.mock('../../../src/discord/index.js', () => ({ getGuildClient: mocks.client }))
const { deliverRewardRole } = await import('../../../src/discord/utils/rewardRole.js')
const input = {
  serverID: 'server',
  grantID: 'c6801874-4d4b-4543-884c-80f379fe7299',
  actionID: 'a6801874-4d4b-4543-884c-80f379fe7299',
  steamID64: '76561198000000000',
  discordID: '123456789012345678',
  roleID: '223456789012345678',
}
let role: any
let member: any
let guild: any
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authorize.mockResolvedValue(true)
  mocks.server.mockResolvedValue({ getGuildID: () => 'community' })
  role = { id: input.roleID, guild: { id: 'community' }, managed: false, editable: true }
  member = {
    id: input.discordID,
    guild: { id: 'community' },
    partial: false,
    roles: { cache: new Map(), add: mocks.add },
  }
  guild = {
    id: 'community',
    roles: { fetch: vi.fn(async () => role) },
    members: { fetch: vi.fn(async () => member), fetchMe: vi.fn() },
  }
  mocks.client.mockResolvedValue({ guilds: { fetch: vi.fn(async () => guild) } })
})
describe('Discord reward role delivery', () => {
  it('adds only the granted role after rechecking the persisted grant at execution time', async () => {
    expect(await deliverRewardRole(input)).toEqual({ status: 'delivered' })
    expect(mocks.authorize).toHaveBeenCalledTimes(2)
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(input.roleID, 'Gmod Integration reward')
  })
  it('does not contact Discord for revoked, expired, foreign or unlinked grants', async () => {
    mocks.authorize.mockResolvedValue(false)
    expect(await deliverRewardRole(input)).toMatchObject({ status: 'failed' })
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.add).not.toHaveBeenCalled()
  })
  it('stops when authorization changes during provider reads', async () => {
    mocks.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await deliverRewardRole(input)).toMatchObject({ status: 'failed' })
    expect(mocks.add).not.toHaveBeenCalled()
  })
  it('acknowledges an existing role without distributing any additional privilege', async () => {
    member.roles.cache.set(input.roleID, role)
    expect(await deliverRewardRole(input)).toEqual({ status: 'delivered' })
    expect(mocks.add).not.toHaveBeenCalled()
  })
  it.each(['missing', 'managed', 'everyone', 'unmanageable', 'foreign'])('rejects a %s role', async (scenario) => {
    if (scenario === 'missing') role = null
    if (scenario === 'managed') role.managed = true
    if (scenario === 'everyone') role.id = 'community'
    if (scenario === 'unmanageable') role.editable = false
    if (scenario === 'foreign') role.guild.id = 'foreign'
    expect(await deliverRewardRole(input)).toMatchObject({ status: 'failed' })
    expect(mocks.add).not.toHaveBeenCalled()
  })
  it('keeps an outcome uncertain when Discord may have applied the role before its response failed', async () => {
    mocks.add.mockRejectedValueOnce(new Error('connection reset'))
    expect(await deliverRewardRole(input)).toEqual({ status: 'uncertain', reason: 'provider_unavailable' })
  })
})
