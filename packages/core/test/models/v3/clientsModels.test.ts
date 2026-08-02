import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRandomDiscordRelayMock = vi.fn(() => 'https://relay.example')
vi.mock('../../../src/utils/tools.js', () => ({ getRandomDiscordRelay: getRandomDiscordRelayMock }))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { embedColor: '#ffffff', barerTokenRelay: 'relay-token' },
  ConfigServer: { domain: 'https://gmod-integration.com', screenshotChannel: '' },
}))

const getSteamUserAvatarLargeMock = vi.fn(async () => 'https://avatar.example')
vi.mock('@gmod/infra-steam', () => ({ getSteamUserAvatarLarge: getSteamUserAvatarLargeMock }))

vi.mock('uuid', () => ({ v4: vi.fn(() => 'uuid-1') }))

const createBucketIfNotExistsMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({
  createBucketIfNotExists: createBucketIfNotExistsMock,
  s3: { send: s3SendMock },
}))

const enqueueMainClientUploadScreenshotMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueMainClientUploadScreenshot: enqueueMainClientUploadScreenshotMock,
}))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../../../src/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const prismaMock: any = {
  gm_server_screenshots: { create: vi.fn() },
  gm_server_report_bugs: { create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { saveScreenshot, sendScreenshotToDiscord, uploadScreenshotPayload, reportBugPayload } = await import(
  '../../../src/models/v3/clientsModels.js'
)

const fakePlayer = { steamID64: '765', name: 'Bob' } as any

function makeServer(overrides: Record<string, any> = {}) {
  return {
    id: 's1',
    getID: () => 's1',
    getName: () => 'My Server',
    getScreenshotsChannel: vi.fn().mockResolvedValue({ webhook: 'wh1', token: 'tok' }),
    ...overrides,
  } as any
}

describe('clientsModels', () => {
  beforeEach(() => {
    getRandomDiscordRelayMock.mockClear()
    getSteamUserAvatarLargeMock.mockClear()
    createBucketIfNotExistsMock.mockReset()
    s3SendMock.mockReset()
    enqueueMainClientUploadScreenshotMock.mockReset()
    getTranslateMock.mockClear()
    for (const table of Object.values(prismaMock)) {
      for (const fn of Object.values(table as Record<string, any>)) {
        ;(fn as ReturnType<typeof vi.fn>).mockReset()
      }
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  describe('saveScreenshot', () => {
    it('uploads to S3 and persists the DB row, skipping Discord upload when no channel is configured', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})

      const result = await saveScreenshot(
        'data:image/jpeg;base64,AAAA',
        { format: 'jpeg' },
        fakePlayer,
        makeServer(),
        'My title',
      )

      expect(createBucketIfNotExistsMock).toHaveBeenCalledWith('gmi-players-screenshots')
      expect(enqueueMainClientUploadScreenshotMock).not.toHaveBeenCalled()
      expect(result.discordUrl).toBe('')
      expect(result.internUrl).toContain('https://gmod-integration.com/screenshots/')
    })

    it('defaults the format to jpeg when captureData.format is missing', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})

      const result = await saveScreenshot('data:image/jpeg;base64,AAAA', {}, fakePlayer, makeServer(), undefined)

      expect(result.filename).toContain('.jpeg')
    })

    it('logs and continues when the S3 upload fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('s3 down'))
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await saveScreenshot('data:image/jpeg;base64,AAAA', { format: 'png' }, fakePlayer, makeServer(), 'title')

      expect(errorSpy).toHaveBeenCalledWith('Error uploading players screenshot to S3:', expect.any(Error))
    })

    it('uploads to the configured Discord channel and returns its URL', async () => {
      const { ConfigServer } = await import('@gmod/config')
      const original = (ConfigServer as any).screenshotChannel
      ;(ConfigServer as any).screenshotChannel = 'ch1'
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      enqueueMainClientUploadScreenshotMock.mockResolvedValueOnce('https://discord.example/file.jpeg')

      try {
        const result = await saveScreenshot(
          'data:image/jpeg;base64,AAAA',
          { format: 'jpeg' },
          fakePlayer,
          makeServer(),
          'title',
        )
        expect(result.discordUrl).toBe('https://discord.example/file.jpeg')
      } finally {
        ;(ConfigServer as any).screenshotChannel = original
      }
    })

    it('falls back to an empty discordUrl when the bullmq upload fails', async () => {
      const { ConfigServer } = await import('@gmod/config')
      const original = (ConfigServer as any).screenshotChannel
      ;(ConfigServer as any).screenshotChannel = 'ch1'
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      enqueueMainClientUploadScreenshotMock.mockRejectedValueOnce(new Error('upload failed'))

      try {
        const result = await saveScreenshot(
          'data:image/jpeg;base64,AAAA',
          { format: 'jpeg' },
          fakePlayer,
          makeServer(),
          'title',
        )
        expect(result.discordUrl).toBe('')
      } finally {
        ;(ConfigServer as any).screenshotChannel = original
      }
    })
  })

  describe('sendScreenshotToDiscord', () => {
    it('skips when the server has no screenshots channel configured', async () => {
      const server = makeServer({ getScreenshotsChannel: vi.fn().mockResolvedValue(null) })
      const result = await sendScreenshotToDiscord('durl', 'iurl', 'file.jpeg', fakePlayer, server, 'title')
      expect(result).toEqual({ skip: true, message: 'Channel not found' })
    })

    it('sends the embed via the relay using the given title', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      const server = makeServer()

      const result = await sendScreenshotToDiscord('https://cdn.example/durl.png', 'https://gmod-integration.com/iurl', 'file.jpeg', fakePlayer, server, 'My title')

      expect(fetchMock).toHaveBeenCalledWith('https://relay.example', expect.objectContaining({ method: 'POST' }))
      expect(result).toEqual({ success: true })
    })

    it('falls back to the translated default title when none is given', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      const server = makeServer()

      await sendScreenshotToDiscord('https://cdn.example/durl.png', 'https://gmod-integration.com/iurl', 'file.jpeg', fakePlayer, server, undefined)

      expect(getTranslateMock).toHaveBeenCalledWith('discord.screenshot.no_title', 'No title')
    })
  })

  describe('uploadScreenshotPayload', () => {
    it('returns a missing_arguments error when required fields are absent', async () => {
      const result = await uploadScreenshotPayload(makeServer(), { player: fakePlayer })
      expect(result).toEqual(
        expect.objectContaining({ error: 'missing_arguments', args: expect.objectContaining({ screenshot: false }) }),
      )
    })

    it('saves the screenshot, sends it to Discord, and reports success', async () => {
      const { ConfigServer } = await import('@gmod/config')
      const original = (ConfigServer as any).screenshotChannel
      ;(ConfigServer as any).screenshotChannel = 'ch1'
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      enqueueMainClientUploadScreenshotMock.mockResolvedValueOnce('https://discord.example/file.jpeg')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
      const server = makeServer()

      try {
        const result = await uploadScreenshotPayload(server, {
          player: fakePlayer,
          screenshot: 'data:image/jpeg;base64,AAAA',
          captureData: { format: 'jpeg' },
          size: 100,
          title: 'title',
        })

        expect(result).toEqual({ success: true })
      } finally {
        ;(ConfigServer as any).screenshotChannel = original
      }
    })
  })

  describe('reportBugPayload', () => {
    it('returns a missing_arguments error when required fields are absent', async () => {
      const result = await reportBugPayload(makeServer(), { player: fakePlayer })
      expect(result).toEqual(
        expect.objectContaining({ error: 'missing_arguments' }),
      )
    })

    it('creates the bug report without a screenshot when none is given', async () => {
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1 })

      const result = await reportBugPayload(makeServer(), {
        player: fakePlayer,
        description: 'desc',
        importance: 'high',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
      })

      expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenshot: '' }) }),
      )
      expect(result).toEqual({ id: 1 })
    })

    it('skips saving the screenshot when its sub-fields are incomplete', async () => {
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1 })

      await reportBugPayload(makeServer(), {
        player: fakePlayer,
        description: 'desc',
        importance: 'high',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
        screenshot: { screenshot: 'data:image/jpeg;base64,AAAA' },
      })

      expect(s3SendMock).not.toHaveBeenCalled()
    })

    it('saves the screenshot and includes its filename when all sub-fields are present', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1 })

      await reportBugPayload(makeServer(), {
        player: fakePlayer,
        description: 'desc',
        importance: 'high',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
        screenshot: { screenshot: 'data:image/jpeg;base64,AAAA', captureData: { format: 'jpeg' }, size: 100 },
      })

      expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenshot: expect.stringContaining('.jpeg') }) }),
      )
    })

    it('falls back to an empty screenshot name and logs when saveScreenshot fails', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockRejectedValueOnce(new Error('db down'))
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1 })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await reportBugPayload(makeServer(), {
        player: fakePlayer,
        description: 'desc',
        importance: 'high',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
        screenshot: { screenshot: 'data:image/jpeg;base64,AAAA', captureData: { format: 'jpeg' }, size: 100 },
      })

      expect(errorSpy).toHaveBeenCalled()
      expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenshot: '' }) }),
      )
    })
  })
})
