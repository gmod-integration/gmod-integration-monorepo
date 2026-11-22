import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ server: vi.fn(), captures: vi.fn(), render: vi.fn() }))
vi.mock('@gmod/config', () => ({ ConfigServer: { domain: 'https://api.example.test' } }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server: { findFirst: mocks.server }, gm_server_screenshots: { findMany: mocks.captures } },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordServerStatusPreview: mocks.render }))
const { adminScreenshotURL, getAdminServerPreviews, getAdminServerStatusPreview } =
  await import('../../../src/models/v6/adminServerPreviews.js')
beforeEach(() => {
  vi.resetAllMocks()
  mocks.server.mockResolvedValue({ id: 's1', name: 'Example server', guild: 'g1' })
  mocks.captures.mockResolvedValue([])
})
describe('read-only administration previews', () => {
  it.each([
    'https://elsewhere.test/screenshots/a.png',
    'javascript:alert(1)',
    'https://api.example.test/screenshots/a.svg',
    'https://api.example.test/screenshots/a.png?token=x',
    'https://user@api.example.test/screenshots/a.png',
    'https://api.example.test/avatars/a.png',
  ])('rejects unsafe capture sources: %s', (url) => expect(adminScreenshotURL(url)).toBeNull())
  it('selects only six recent captures without raw player, capture metadata or credentials', async () => {
    mocks.captures.mockResolvedValue([
      {
        id: 2,
        title: 'Game view',
        url: 'https://api.example.test/screenshots/capture_2.png',
        createdAt: new Date('2026-11-22T12:00:00Z'),
      },
      { id: 1, title: 'Unsupported', url: 'https://elsewhere.test/screenshots/capture.png', createdAt: new Date() },
    ])
    const result = await getAdminServerPreviews('s1')
    expect(result.screenshots).toHaveLength(1)
    expect(result.server).toEqual({ id: 's1', name: 'Example server', guildID: 'g1' })
    expect(mocks.captures).toHaveBeenCalledWith({
      where: { serverID: 's1' },
      take: 6,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, title: true, url: true, createdAt: true },
    })
  })
  it('rejects invalid or missing servers before requesting captures or a Discord rendering', async () => {
    await expect(getAdminServerPreviews('../s1')).rejects.toMatchObject({ status: 400 })
    expect(mocks.server).not.toHaveBeenCalled()
    mocks.server.mockResolvedValueOnce(null)
    await expect(getAdminServerStatusPreview('missing', {})).rejects.toMatchObject({ status: 404 })
    expect(mocks.render).not.toHaveBeenCalled()
    expect(mocks.captures).not.toHaveBeenCalled()
  })
  it('requests the saved effective status in the chosen language and propagates unavailability', async () => {
    mocks.render.mockRejectedValueOnce(new Error('Worker unavailable'))
    await expect(getAdminServerStatusPreview('s1', { locale: 'fr' })).rejects.toThrow('Worker unavailable')
    expect(mocks.render).toHaveBeenCalledWith('s1', { settings: {}, locale: 'fr' }, 10000)
    await expect(getAdminServerStatusPreview('s1', { simulation: true })).rejects.toMatchObject({ status: 400 })
    expect(mocks.render).toHaveBeenCalledTimes(1)
  })
})
