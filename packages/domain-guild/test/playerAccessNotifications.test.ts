import { beforeEach, describe, expect, it, vi } from 'vitest'
const settings = vi.hoisted(() => vi.fn())
const user = vi.hoisted(() => vi.fn())
const add = vi.hoisted(() => vi.fn())
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_server_settings: { findMany: settings } } }))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: user }))
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add } }))
const { refreshGuildMemberPlayerAccess, refreshGuildRolePlayerAccess } =
  await import('../src/playerAccessNotifications.js')
beforeEach(() => {
  settings.mockReset().mockResolvedValue([])
  user.mockReset().mockResolvedValue({ getSteamID64: () => '76561198000000001' })
  add.mockReset().mockResolvedValue({})
})
describe('player access invalidation notifications', () => {
  it('targets only configured servers of the actual guild and sends no permission grants', async () => {
    settings.mockResolvedValueOnce([{ serverID: 'mine' }, { serverID: 'mine' }, { serverID: 'other-local' }])
    await refreshGuildMemberPlayerAccess('guild', 'member')
    expect(settings).toHaveBeenCalledWith({
      where: { setting: 'maintenance_whitelist_role', value: { not: '' }, gm_server: { guild: 'guild' } },
      select: { serverID: true },
    })
    expect(user).toHaveBeenCalledWith('member')
    expect(add).toHaveBeenCalledTimes(2)
    expect(add).toHaveBeenCalledWith(
      'wsSendToServer',
      { id: 'mine', data: { method: 'wsRefreshPlayerAccess', steamID: '76561198000000001' } },
      expect.any(Object),
    )
  })
  it('does not look up identities or notify foreign/unconfigured guild servers', async () => {
    await refreshGuildMemberPlayerAccess('foreign', 'member')
    expect(user).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })
  it.each([null, '', 'invalid'])(
    'does not broadcast for missing, erased or invalid Steam links (%s)',
    async (steamID) => {
      settings.mockResolvedValueOnce([{ serverID: 'mine' }])
      user.mockResolvedValueOnce(steamID === null ? null : { getSteamID64: () => steamID })
      await refreshGuildMemberPlayerAccess('guild', 'member')
      expect(add).not.toHaveBeenCalled()
    },
  )
  it('refreshes all online players only for servers configured for a deleted role in that guild', async () => {
    settings.mockResolvedValueOnce([{ serverID: 'mine' }])
    await refreshGuildRolePlayerAccess('guild', 'deleted-role')
    expect(settings).toHaveBeenCalledWith({
      where: { setting: 'maintenance_whitelist_role', value: 'deleted-role', gm_server: { guild: 'guild' } },
      select: { serverID: true },
    })
    expect(add).toHaveBeenCalledWith(
      'wsSendToServer',
      { id: 'mine', data: { method: 'wsRefreshPlayerAccess' } },
      expect.any(Object),
    )
    expect(user).not.toHaveBeenCalled()
  })
  it('continues notifying the other configured servers when one queue submission fails', async () => {
    settings.mockResolvedValueOnce([{ serverID: 'first' }, { serverID: 'second' }])
    add.mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(refreshGuildMemberPlayerAccess('guild', 'member')).resolves.toBeUndefined()
    expect(add).toHaveBeenCalledTimes(2)
  })
})
