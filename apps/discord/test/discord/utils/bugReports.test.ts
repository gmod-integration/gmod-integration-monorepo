import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ report: vi.fn(), setting: vi.fn(), erasure: vi.fn(), destination: vi.fn() }))
const config = vi.hoisted(() => ({ domain: 'https://api.example.test' }))
vi.mock('@gmod/config', () => ({ ConfigServer: config }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server_report_bugs: { findFirst: mocks.report }, gm_server_settings: { findUnique: mocks.setting } },
}))
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: mocks.erasure }))
vi.mock('../../../src/discord/utils/reportChannels.js', () => ({ resolveReportChannel: mocks.destination }))
const { sendBugReport } = await import('../../../src/discord/utils/bugReports.js')
const serverID = 'server-one',
  channelID = '111111111111111111',
  steamID64 = '76561198000000001'
const job = { serverID, reportID: 42 }
const filename = `2026-11-23_08-00-00_${steamID64}_01234567-0123-4567-89ab-0123456789ab.jpeg`
const report = {
  id: 42,
  serverID,
  steamID64,
  description: 'Bug @everyone',
  steps: 'Open the door',
  expected: 'Door opens',
  actual: 'Door stays closed',
  importance: 'high',
  screenshot: filename,
  createdAt: new Date('2026-11-23T08:00:00Z'),
}
let channel: { send: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.resetAllMocks()
  config.domain = 'https://api.example.test'
  mocks.report.mockResolvedValue(report)
  mocks.setting.mockResolvedValue({ value: channelID })
  mocks.erasure.mockResolvedValue(false)
  channel = { send: vi.fn().mockResolvedValue({ id: 'message' }) }
  mocks.destination.mockResolvedValue({
    channel,
    server: { id: serverID, name: 'Test server' },
    result: { valid: true },
  })
})
describe('bug report Discord publication', () => {
  it('loads only the scoped saved report and current destination before rendering a mention-safe embed', async () => {
    await sendBugReport(job)
    expect(mocks.report).toHaveBeenCalledTimes(2)
    expect(mocks.report).toHaveBeenCalledWith({ where: { id: 42, serverID } })
    expect(mocks.setting).toHaveBeenCalledWith({
      where: { serverID_setting: { serverID, setting: 'bug_reports_channel' } },
      select: { value: true },
    })
    expect(mocks.destination).toHaveBeenCalledExactlyOnceWith(serverID, channelID)
    const message = channel.send.mock.calls[0][0],
      embed = message.embeds[0].toJSON()
    expect(message.allowedMentions).toEqual({ parse: [] })
    expect(embed.title).toBe('Bug report — Test server')
    expect(embed.description).toContain('Bug @everyone')
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Player', value: steamID64 }),
        expect.objectContaining({ name: 'Importance', value: 'high' }),
        expect.objectContaining({ name: 'Steps to reproduce', value: expect.stringContaining('Open the door') }),
        expect.objectContaining({ name: 'Expected result', value: expect.stringContaining('Door opens') }),
        expect.objectContaining({ name: 'Actual result', value: expect.stringContaining('Door stays closed') }),
      ]),
    )
    expect(embed.image.url).toBe(`https://api.example.test/screenshots/${filename}`)
    expect(embed.footer.text).toContain('Report #42')
  })
  it.each([null, { ...report, serverID: 'foreign' }, { ...report, id: 99 }])(
    'skips a missing or mismatched report: %j',
    async (row) => {
      mocks.report.mockResolvedValueOnce(row)
      await sendBugReport(job)
      expect(mocks.destination).not.toHaveBeenCalled()
      expect(channel.send).not.toHaveBeenCalled()
    },
  )
  it.each([null, { value: '' }, { value: 'invalid' }])(
    'skips an unset or malformed destination: %j',
    async (setting) => {
      mocks.setting.mockResolvedValueOnce(setting)
      await sendBugReport(job)
      expect(mocks.destination).not.toHaveBeenCalled()
      expect(channel.send).not.toHaveBeenCalled()
    },
  )
  it('skips an unavailable, foreign or non-text destination already rejected by the shared resolver', async () => {
    mocks.destination.mockResolvedValueOnce({ result: { valid: false, reason: 'missing_permissions' } })
    await sendBugReport(job)
    expect(channel.send).not.toHaveBeenCalled()
  })
  it.each(['removed', 'changed'])('skips a binding %s while the provider lookup waits', async (change) => {
    mocks.setting
      .mockResolvedValueOnce({ value: channelID })
      .mockResolvedValueOnce(change === 'removed' ? null : { value: '222222222222222222' })
    await sendBugReport(job)
    expect(channel.send).not.toHaveBeenCalled()
  })
  it.each([
    null,
    { ...report, serverID: 'foreign' },
    { ...report, id: 99 },
    { ...report, steamID64: '76561198000000002' },
  ])('skips a report removed or reassigned during provider lookup: %j', async (current) => {
    mocks.report.mockResolvedValueOnce(report).mockResolvedValueOnce(current)
    await sendBugReport(job)
    expect(channel.send).not.toHaveBeenCalled()
  })
  it.each(['before', 'after'])('does not publish data erased %s the provider lookup', async (stage) => {
    mocks.erasure.mockResolvedValueOnce(stage === 'before').mockResolvedValueOnce(true)
    await sendBugReport(job)
    expect(mocks.erasure).toHaveBeenCalledWith(undefined, steamID64)
    expect(channel.send).not.toHaveBeenCalled()
  })
  it('renders the most recent persisted report content and keeps payloads below Discord limits', async () => {
    mocks.report.mockResolvedValueOnce(report).mockResolvedValueOnce({
      ...report,
      description: '```@everyone'.repeat(1000),
      steps: 's'.repeat(2000),
      expected: 'e'.repeat(2000),
      actual: '',
    })
    mocks.destination.mockResolvedValueOnce({ channel, server: { id: 's'.repeat(255), name: 'n'.repeat(1000) } })
    await sendBugReport(job)
    const embed = channel.send.mock.calls[0][0].embeds[0].toJSON()
    expect(embed.title.length).toBe(256)
    expect(embed.description.length).toBeLessThanOrEqual(4096)
    expect(embed.description.match(/```/g)).toHaveLength(2)
    expect(embed.fields.every((field: { value: string }) => field.value.length <= 1024)).toBe(true)
    expect(embed.fields.find((field: { name: string }) => field.name === 'Actual result').value).toContain(
      'Not provided',
    )
    expect(
      embed.title.length +
        embed.description.length +
        embed.footer.text.length +
        embed.fields.reduce((n: number, f: { name: string; value: string }) => n + f.name.length + f.value.length, 0),
    ).toBeLessThanOrEqual(6000)
  })
  it.each(['', '../private.png', 'https://foreign.test/image.jpeg', filename.replace(steamID64, '76561198000000002')])(
    'does not trust arbitrary screenshot locations: %s',
    async (screenshot) => {
      mocks.report.mockResolvedValue({ ...report, screenshot })
      await sendBugReport(job)
      expect(channel.send.mock.calls[0][0].embeds[0].toJSON().image).toBeUndefined()
    },
  )
  it.each(['ftp://api.example.test', 'https://private:secret@api.example.test', 'invalid'])(
    'does not expose an unsafe configured image origin: %s',
    async (domain) => {
      config.domain = domain
      await sendBugReport(job)
      expect(channel.send.mock.calls[0][0].embeds[0].toJSON().image).toBeUndefined()
    },
  )
  it('uses the server ID fallback and canonical stored PNGs on a local HTTP origin', async () => {
    config.domain = 'http://127.0.0.1:53136'
    mocks.report.mockResolvedValue({ ...report, screenshot: filename.replace('.jpeg', '.png') })
    mocks.destination.mockResolvedValueOnce({ channel, server: { id: serverID, name: '' } })
    await sendBugReport(job)
    const embed = channel.send.mock.calls[0][0].embeds[0].toJSON()
    expect(embed.title).toBe(`Bug report — ${serverID}`)
    expect(embed.image.url).toBe(`http://127.0.0.1:53136/screenshots/${filename.replace('.jpeg', '.png')}`)
  })
  it.each(['database', 'provider', 'send'])('preserves history after a %s outage without replay', async (failure) => {
    if (failure === 'database') mocks.report.mockRejectedValueOnce(new Error('private detail'))
    if (failure === 'provider') mocks.destination.mockRejectedValueOnce(new Error('private detail'))
    if (failure === 'send') channel.send.mockRejectedValueOnce(new Error('private detail'))
    await expect(sendBugReport(job)).resolves.toBeUndefined()
    expect(channel.send).toHaveBeenCalledTimes(failure === 'send' ? 1 : 0)
  })
})
