import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), remove: vi.fn(), validate: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server_settings: { findUnique: mocks.read, upsert: mocks.save, deleteMany: mocks.remove } },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordServerErrorsChannelValidate: mocks.validate,
}))
const { getBugReportChannel, setBugReportChannel, removeBugReportChannel, BugReportChannelError } =
  await import('../../../src/models/gmod/bugReportChannels.js')
const channelID = '333333333333333333'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.read.mockResolvedValue({ value: channelID })
  mocks.validate.mockResolvedValue({ valid: true })
})
describe('bug report destination', () => {
  it('reads and replaces only the server bug report binding, independently of Lua errors', async () => {
    expect(await getBugReportChannel('mine')).toEqual({ channelID })
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({
      where: { serverID_setting: { serverID: 'mine', setting: 'bug_reports_channel' } },
      select: { value: true },
    })
    expect(await setBugReportChannel('mine', { channelID })).toEqual({ channelID })
    expect(mocks.validate).toHaveBeenCalledExactlyOnceWith('mine', channelID)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      where: { serverID_setting: { serverID: 'mine', setting: 'bug_reports_channel' } },
      create: { serverID: 'mine', setting: 'bug_reports_channel', value: channelID },
      update: { value: channelID },
    })
  })
  it('preserves the configured destination on validation failure', async () => {
    mocks.validate.mockResolvedValueOnce({ valid: false, reason: 'missing_permissions' })
    await expect(setBugReportChannel('mine', { channelID })).rejects.toBeInstanceOf(BugReportChannelError)
    expect(mocks.save).not.toHaveBeenCalled()
    await expect(setBugReportChannel('mine', { channelID, serverID: 'foreign' })).rejects.toMatchObject({ status: 400 })
  })
  it('clears only the local bug report binding while the Discord bot is unavailable', async () => {
    mocks.validate.mockRejectedValue(new Error('Offline'))
    expect(await removeBugReportChannel('mine')).toEqual({})
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({
      where: { serverID: 'mine', setting: 'bug_reports_channel' },
    })
    expect(mocks.validate).not.toHaveBeenCalled()
  })
})
