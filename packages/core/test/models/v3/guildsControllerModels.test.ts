import { beforeEach, describe, expect, it, vi } from 'vitest'
const getServers = vi.hoisted(() => vi.fn())
const channels = vi.hoisted(() => vi.fn())
const queue = vi.hoisted(() => vi.fn())
const avatar = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: getServers }))
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: queue } }))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_sync_chat: { findMany: channels } } }))
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: avatar }))
const { processDiscordMessageToGmod } = await import('../../../src/models/v3/guildsControllerModels.js')
const message = (overrides = {}) =>
  ({
    author: { bot: false, id: 'u1', username: 'Bob', displayAvatarURL: () => 'https://avatar.example' },
    guild: { id: 'g1' },
    channel: { id: 'staff-channel' },
    content: 'Staff message',
    ...overrides,
  }) as any
const server = (id: string, guild = 'g1', direction = 'both') => ({
  getID: () => id,
  getGuildID: () => guild,
  getEffectiveSetting: vi.fn().mockResolvedValue(direction),
})
beforeEach(() => {
  vi.resetAllMocks()
  channels.mockResolvedValue([{ server: 'staff-server' }])
  getServers.mockResolvedValue([])
  avatar.mockResolvedValue('stored-avatar')
})
describe('community/channel scoped Discord chat forwarding', () => {
  it('ignores bot and direct messages without database access', async () => {
    await processDiscordMessageToGmod(message({ author: { bot: true } }))
    await processDiscordMessageToGmod(message({ guild: null }))
    expect(channels).not.toHaveBeenCalled()
  })
  it('looks up the exact source community/channel and stops if no server is bound', async () => {
    channels.mockResolvedValueOnce([])
    await processDiscordMessageToGmod(message())
    expect(channels).toHaveBeenCalledWith({
      where: { guild: 'g1', channel: 'staff-channel' },
      select: { server: true },
    })
    expect(getServers).not.toHaveBeenCalled()
  })
  it('only forwards a staff message to servers bound to that source channel', async () => {
    const staff = server('staff-server'),
      publicServer = server('public-server')
    getServers.mockResolvedValueOnce([staff, publicServer])
    await processDiscordMessageToGmod(message())
    expect(queue).toHaveBeenCalledExactlyOnceWith('wsSendToServer', {
      id: 'staff-server',
      data: { method: 'wsPlayerSay', name: 'Bob', content: 'Staff message', avatar: 'stored-avatar' },
    })
    expect(publicServer.getEffectiveSetting).not.toHaveBeenCalled()
  })
  it('rejects a mismatched community even if a corrupted mapping lists the server', async () => {
    const target = server('staff-server', 'other')
    getServers.mockResolvedValueOnce([target])
    await processDiscordMessageToGmod(message())
    expect(queue).not.toHaveBeenCalled()
    expect(target.getEffectiveSetting).not.toHaveBeenCalled()
    expect(avatar).not.toHaveBeenCalled()
  })
  it.each(['gmodToDiscord', 'disabled'])(
    'respects the effective direction %s after subscription changes',
    async (direction) => {
      getServers.mockResolvedValueOnce([server('staff-server', 'g1', direction)])
      await processDiscordMessageToGmod(message())
      expect(queue).not.toHaveBeenCalled()
      expect(avatar).not.toHaveBeenCalled()
    },
  )
  it('fans out only to multiple servers intentionally sharing the same channel', async () => {
    channels.mockResolvedValueOnce([{ server: 'staff-server' }, { server: 'other-staff' }])
    getServers.mockResolvedValueOnce([
      server('staff-server'),
      server('other-staff', 'g1', 'discordToGmod'),
      server('public-server'),
    ])
    await processDiscordMessageToGmod(message())
    expect(queue.mock.calls.map(([, target]) => target.id)).toEqual(['staff-server', 'other-staff'])
  })
})
