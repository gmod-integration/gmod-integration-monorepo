import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setting: vi.fn(), user: vi.fn(), membership: vi.fn(), enqueue: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server_settings: { findUnique: mocks.setting }, gm_user: { findFirst: mocks.user } },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildMemberRole: mocks.membership }))
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: mocks.enqueue } }))
const { getServerPlayerAccess, refreshServerPlayerAccess } = await import('../src/playerAccess.js')
const steamID = '76561198012345678'
const roleID = '333333333333333333'
const server = () => ({
  id: 'server-one',
  guild: '222222222222222222',
  getPlayerStats: vi.fn().mockResolvedValue({ steam_id: steamID, bypassMaintenance: false, ban: false }),
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.setting.mockResolvedValue({ value: roleID })
  mocks.user.mockResolvedValue({ id: '111111111111111111' })
  mocks.membership.mockResolvedValue({ available: true, hasRole: true, roleExists: true })
  mocks.enqueue.mockResolvedValue({})
})

describe('server whitelist authorization', () => {
  it('preserves an independent manual grant even while Discord or role configuration is unavailable', async () => {
    const source = server()
    source.getPlayerStats.mockResolvedValueOnce({ steam_id: steamID, bypassMaintenance: true, ban: false })
    expect(await getServerPlayerAccess(source, steamID)).toMatchObject({ bypassMaintenance: true, discordAdmin: false })
    expect(mocks.setting).not.toHaveBeenCalled()
    expect(mocks.membership).not.toHaveBeenCalled()
  })
  it('authorizes a linked first-time player without writing a manual exception', async () => {
    const source = server()
    source.getPlayerStats.mockResolvedValue(null)
    expect(await getServerPlayerAccess(source, steamID)).toEqual({ bypassMaintenance: true, discordAdmin: false })
    expect(mocks.membership).toHaveBeenCalledWith(source.guild, '111111111111111111', roleID)
    expect(mocks.setting).toHaveBeenCalledWith({
      where: { serverID_setting: { serverID: source.id, setting: 'maintenance_whitelist_role' } },
      select: { value: true },
    })
  })
  it('observes role loss on the next lookup instead of reusing a positive grant', async () => {
    const source = server()
    expect((await getServerPlayerAccess(source, steamID)).bypassMaintenance).toBe(true)
    mocks.membership.mockResolvedValueOnce({ available: true, hasRole: false, roleExists: true })
    expect(await getServerPlayerAccess(source, steamID)).toMatchObject({ bypassMaintenance: false, ban: false })
    expect(mocks.membership).toHaveBeenCalledTimes(2)
    expect(mocks.user).toHaveBeenCalledTimes(4)
    expect(source.getPlayerStats).toHaveBeenCalledTimes(4)
  })
  it.each([null, { value: '' }])('keeps unconfigured role access disabled: %j', async (setting) => {
    mocks.setting.mockResolvedValueOnce(setting)
    expect((await getServerPlayerAccess(server(), steamID)).bypassMaintenance).toBe(false)
    expect(mocks.user).not.toHaveBeenCalled()
    expect(mocks.membership).not.toHaveBeenCalled()
  })
  it('does not invent a Discord identity for an unlinked player or a bot', async () => {
    mocks.user.mockResolvedValueOnce(null)
    expect((await getServerPlayerAccess(server(), steamID)).bypassMaintenance).toBe(false)
    expect((await getServerPlayerAccess(server(), '0')).bypassMaintenance).toBe(false)
    expect(mocks.membership).not.toHaveBeenCalled()
    expect(mocks.user).toHaveBeenCalledOnce()
  })
  it('treats a confirmed deleted role as a denial', async () => {
    mocks.membership.mockResolvedValueOnce({ available: true, hasRole: false, roleExists: false })
    expect((await getServerPlayerAccess(server(), steamID)).bypassMaintenance).toBe(false)
  })
  it.each(['role', 'link', 'role removal', 'link removal'])(
    'rejects a decision overtaken by a durable %s change',
    async (change) => {
      mocks.membership.mockImplementationOnce(async () => {
        if (change === 'role') mocks.setting.mockResolvedValue({ value: '444444444444444444' })
        else if (change === 'link') mocks.user.mockResolvedValue({ id: '555555555555555555' })
        else if (change === 'role removal') mocks.setting.mockResolvedValue(null)
        else mocks.user.mockResolvedValue(null)
        return { available: true, hasRole: true, roleExists: true }
      })
      await expect(getServerPlayerAccess(server(), steamID)).rejects.toMatchObject({ status: 503 })
    },
  )
  it.each(['denied', 'unavailable', 'transport'])(
    'preserves a manual grant added during a %s role lookup',
    async (result) => {
      const source = server()
      source.getPlayerStats
        .mockResolvedValueOnce({ steam_id: steamID, bypassMaintenance: false, ban: false })
        .mockResolvedValueOnce({ steam_id: steamID, bypassMaintenance: true, ban: false })
      if (result === 'transport') mocks.membership.mockRejectedValueOnce(new Error('Provider unavailable'))
      else
        mocks.membership.mockResolvedValueOnce({
          available: result !== 'unavailable',
          hasRole: false,
          roleExists: true,
        })
      expect((await getServerPlayerAccess(source, steamID)).bypassMaintenance).toBe(true)
    },
  )
  it.each(['provider', 'transport', 'storage', 'configuration'])(
    'keeps an unknown %s result distinct from a confirmed denial',
    async (failure) => {
      if (failure === 'provider')
        mocks.membership.mockResolvedValueOnce({ available: false, hasRole: false, roleExists: false })
      if (failure === 'transport') mocks.membership.mockRejectedValueOnce(new Error('private provider detail'))
      if (failure === 'storage') mocks.user.mockRejectedValueOnce(new Error('private database detail'))
      if (failure === 'configuration') mocks.setting.mockResolvedValueOnce({ value: 'invalid role' })
      await expect(getServerPlayerAccess(server(), steamID)).rejects.toMatchObject({
        code: 'provider_unavailable',
        status: 503,
        message: 'Whitelist access verification is temporarily unavailable.',
      })
    },
  )
  it('targets refreshes to one server without ever sending an authorization grant', async () => {
    expect(await refreshServerPlayerAccess('server-one', steamID)).toBe(true)
    expect(mocks.enqueue).toHaveBeenLastCalledWith(
      'wsSendToServer',
      {
        id: 'server-one',
        data: { method: 'wsRefreshPlayerAccess', steamID },
      },
      expect.any(Object),
    )
    expect(await refreshServerPlayerAccess('server-two')).toBe(true)
    expect(mocks.enqueue).toHaveBeenLastCalledWith(
      'wsSendToServer',
      {
        id: 'server-two',
        data: { method: 'wsRefreshPlayerAccess' },
      },
      expect.any(Object),
    )
    mocks.enqueue.mockRejectedValueOnce(new Error('Queue unavailable'))
    expect(await refreshServerPlayerAccess('server-one', steamID)).toBe(false)
    await expect(refreshServerPlayerAccess('server-one', '')).rejects.toThrow()
    expect(mocks.enqueue).toHaveBeenCalledTimes(3)
  })
})
