import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), remove: vi.fn(), validate: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server_settings: { findUnique: mocks.read, upsert: mocks.save, deleteMany: mocks.remove } },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordServerErrorsChannelValidate: mocks.validate,
}))
const { getLuaErrorChannel, setLuaErrorChannel, removeLuaErrorChannel } =
  await import('../../../src/models/gmod/luaErrorChannels.js')
const channelID = '333333333333333333'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.read.mockResolvedValue({ value: channelID })
  mocks.validate.mockResolvedValue({ valid: true })
  mocks.save.mockResolvedValue({})
  mocks.remove.mockResolvedValue({ count: 1 })
})

describe('Lua error channel configuration', () => {
  it('reads only the server-scoped saved destination and exposes no internal fields', async () => {
    mocks.read.mockResolvedValueOnce({ value: channelID, token: 'private', webhookToken: 'private' })
    expect(await getLuaErrorChannel('mine')).toEqual({ channelID })
    expect(mocks.read).toHaveBeenCalledWith({
      where: { serverID_setting: { serverID: 'mine', setting: 'lua_errors_channel' } },
      select: { value: true },
    })
    expect(mocks.validate).not.toHaveBeenCalled()
  })
  it.each([null, { value: '' }, { value: 'broken' }])(
    'treats missing or invalid stored destinations as unset: %j',
    async (row) => {
      mocks.read.mockResolvedValueOnce(row)
      expect(await getLuaErrorChannel('mine')).toEqual({})
    },
  )
  it('validates the selected channel before replacing the server destination', async () => {
    mocks.validate.mockImplementationOnce(async () => {
      expect(mocks.save).not.toHaveBeenCalled()
      return { valid: true }
    })
    expect(await setLuaErrorChannel('mine', { channelID })).toEqual({ channelID })
    expect(mocks.validate).toHaveBeenCalledExactlyOnceWith('mine', channelID)
    expect(mocks.save).toHaveBeenCalledWith({
      where: { serverID_setting: { serverID: 'mine', setting: 'lua_errors_channel' } },
      create: { serverID: 'mine', setting: 'lua_errors_channel', value: channelID },
      update: { value: channelID },
    })
  })
  it.each([
    undefined,
    {},
    { channelID: '' },
    { channelID: 123 },
    { channelID: 'x' },
    { channelID, serverID: 'foreign' },
  ])('rejects invalid requests before provider calls or persistence: %j', async (body) => {
    await expect(setLuaErrorChannel('mine', body)).rejects.toMatchObject({ status: 400, code: 'invalid_channel' })
    expect(mocks.validate).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each([
    ['channel_not_found', 404],
    ['server_not_found', 404],
    ['unsupported_channel', 400],
    ['missing_permissions', 403],
    ['provider_unavailable', 503],
  ])('preserves the old destination after a confirmed %s result', async (reason, status) => {
    mocks.validate.mockResolvedValueOnce({ valid: false, reason })
    await expect(setLuaErrorChannel('mine', { channelID })).rejects.toMatchObject({ status })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not expose provider details or falsely acknowledge a database failure', async () => {
    mocks.validate.mockRejectedValueOnce(new Error('private provider detail'))
    await expect(setLuaErrorChannel('mine', { channelID })).rejects.toMatchObject({
      status: 503,
      code: 'provider_unavailable',
      message: 'provider_unavailable',
    })
    expect(mocks.save).not.toHaveBeenCalled()
    mocks.save.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(setLuaErrorChannel('mine', { channelID })).rejects.toThrow('database unavailable')
  })
  it('removes only the server binding and remains idempotent while Discord is unavailable', async () => {
    mocks.validate.mockRejectedValue(new Error('Discord offline'))
    mocks.remove.mockResolvedValue({ count: 0 })
    expect(await removeLuaErrorChannel('mine')).toEqual({})
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: { serverID: 'mine', setting: 'lua_errors_channel' } })
    expect(mocks.validate).not.toHaveBeenCalled()
    mocks.remove.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(removeLuaErrorChannel('mine')).rejects.toThrow('database unavailable')
  })
})
