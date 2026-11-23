import type * as NodeCrypto from 'node:crypto'
import sharp from 'sharp'
import { SCREENSHOT_MAX_BASE64_LENGTH } from '../../../src/utils/boundedRasterScreenshot.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const isErasureBlockedMock = vi.fn().mockResolvedValue(false)
vi.mock('@gmod/domain-user/privacy.js', () => ({
  isErasureBlocked: isErasureBlockedMock,
  PersonalDataErasureError: class extends Error {
    constructor() {
      super('Personal data collection is disabled')
    }
  },
  assertPersonalDataAllowed: async (discordID?: string, steamID64?: string) => {
    if (await isErasureBlockedMock(discordID, steamID64)) throw new Error('Personal data collection is disabled')
  },
  PRIVACY_REVOCATION_CHANNEL: 'gmi:privacy:revoked',
}))

const getRandomDiscordRelayMock = vi.fn(() => 'https://relay.example')
vi.mock('../../../src/utils/tools.js', () => ({ getRandomDiscordRelay: getRandomDiscordRelayMock }))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { embedColor: '#ffffff', barerTokenRelay: 'relay-token' },
  ConfigServer: { domain: 'https://gmod-integration.com', screenshotChannel: '' },
}))

const getSteamUserAvatarLargeMock = vi.fn(async () => 'https://avatar.example')
vi.mock('@gmod/infra-steam', () => ({ getSteamUserAvatarLarge: getSteamUserAvatarLargeMock }))

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeCrypto>()),
  randomUUID: vi.fn(() => 'uuid-1'),
}))

const createBucketIfNotExistsMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({
  createBucketIfNotExists: createBucketIfNotExistsMock,
  s3: { send: s3SendMock },
}))

const enqueueMainClientUploadScreenshotMock = vi.fn()
const enqueueBugReportMock = vi.fn()
const bugReportChannelMock = vi.fn()
const logMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueMainClientUploadScreenshot: enqueueMainClientUploadScreenshotMock,
  enqueueDiscordServerBugReport: enqueueBugReportMock,
}))
vi.mock('../../../src/models/gmod/bugReportChannels.js', () => ({ getBugReportChannel: bugReportChannelMock }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: logMock }))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../../../src/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const prismaMock: any = {
  gm_server_screenshots: { create: vi.fn(), deleteMany: vi.fn() },
  gm_server_report_bugs: { create: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { saveScreenshot, sendScreenshotToDiscord, uploadScreenshotPayload, reportBugPayload } =
  await import('../../../src/models/v3/clientsModels.js')

const jpegBytes = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#335577' } })
  .jpeg()
  .toBuffer()
const jpeg = `data:image/jpeg;base64,${jpegBytes.toString('base64')}`
const fakePlayer = { steamID64: '765', name: 'Bob' } as any
const bugCapture = () => ({
  screenshot: jpeg,
  captureData: { format: 'jpeg', w: 4, h: 2, x: 0, y: 0, quality: 95 },
  size: '1KB',
})

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
    isErasureBlockedMock.mockReset().mockResolvedValue(false)
    getRandomDiscordRelayMock.mockClear()
    getSteamUserAvatarLargeMock.mockClear()
    createBucketIfNotExistsMock.mockReset()
    s3SendMock.mockReset()
    enqueueMainClientUploadScreenshotMock.mockReset()
    enqueueBugReportMock.mockReset().mockResolvedValue(undefined)
    bugReportChannelMock.mockReset().mockResolvedValue({})
    logMock.mockReset()
    getTranslateMock.mockClear()
    for (const table of Object.values(prismaMock)) {
      for (const fn of Object.values(table as Record<string, any>)) {
        ;(fn as ReturnType<typeof vi.fn>).mockReset()
      }
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  describe('saveScreenshot', () => {
    it.each(['svg+xml', 'html', '../png'])(
      'refuses unsupported formats before uploading or recording them: %s',
      async (format) => {
        await expect(saveScreenshot('AAAA', { format }, fakePlayer, makeServer(), 'Capture')).rejects.toThrow(
          'Unsupported screenshot format',
        )
        expect(s3SendMock).not.toHaveBeenCalled()
        expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
      },
    )

    it('removes an upload that finishes after erasure starts instead of publishing or registering it', async () => {
      let blocked = false
      isErasureBlockedMock.mockImplementation(async () => blocked)
      s3SendMock
        .mockImplementationOnce(async () => {
          blocked = true
          return {}
        })
        .mockResolvedValue({})
      await expect(saveScreenshot(jpeg, {}, fakePlayer, makeServer(), 'Private')).rejects.toThrow(
        'Personal data collection is disabled',
      )
      expect(s3SendMock).toHaveBeenCalledTimes(2)
      expect(s3SendMock.mock.calls[1][0].constructor.name).toBe('DeleteObjectCommand')
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
      expect(enqueueMainClientUploadScreenshotMock).not.toHaveBeenCalled()
    })
    it('does not upload or persist a capture for a suppressed player', async () => {
      isErasureBlockedMock.mockResolvedValue(true)
      await expect(saveScreenshot('AAAA', {}, fakePlayer, makeServer(), 'Private')).rejects.toThrow(
        'Personal data collection is disabled',
      )
      expect(s3SendMock).not.toHaveBeenCalled()
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
      expect(enqueueMainClientUploadScreenshotMock).not.toHaveBeenCalled()
    })
    it('does not store an image when erasure starts while it is being validated', async () => {
      isErasureBlockedMock.mockResolvedValueOnce(false).mockResolvedValue(true)
      await expect(saveScreenshot(jpeg, {}, fakePlayer, makeServer(), 'Private')).rejects.toThrow(
        'Personal data collection is disabled',
      )
      expect(createBucketIfNotExistsMock).not.toHaveBeenCalled()
      expect(s3SendMock).not.toHaveBeenCalled()
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
    })
    it.each([
      'AAAA',
      'https://example.test/capture.png',
      'data:image/png;base64,PHN2Zy8+',
      'A'.repeat(SCREENSHOT_MAX_BASE64_LENGTH + 4),
    ])('rejects unsupported, malformed or oversized image content before storage', async (image) => {
      await expect(saveScreenshot(image, {}, fakePlayer, makeServer(), 'Capture')).rejects.toThrow()
      expect(createBucketIfNotExistsMock).not.toHaveBeenCalled()
      expect(s3SendMock).not.toHaveBeenCalled()
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
    })
    it('re-encodes the stored bytes to match the selected format while preserving capture metadata', async () => {
      s3SendMock.mockResolvedValue({})
      const capture = { format: 'png', x: 0, y: 0, w: 4, h: 2, quality: 95 }
      await saveScreenshot(jpeg, capture, fakePlayer, makeServer(), 'Capture')
      const command = s3SendMock.mock.calls[0][0]
      expect(command.input.ContentType).toBe('image/png')
      expect(await sharp(command.input.Body).metadata()).toMatchObject({ format: 'png', width: 4, height: 2 })
      expect(command.input.Body.equals(jpegBytes)).toBe(false)
      expect(prismaMock.gm_server_screenshots.create.mock.calls[0][0].data.captureData).toBe(JSON.stringify(capture))
    })
    it('uploads to S3 and persists the DB row, skipping Discord upload when no channel is configured', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})

      const result = await saveScreenshot(jpeg, { format: 'jpeg' }, fakePlayer, makeServer(), 'My title')

      expect(createBucketIfNotExistsMock).toHaveBeenCalledWith('gmi-players-screenshots')
      expect(enqueueMainClientUploadScreenshotMock).not.toHaveBeenCalled()
      expect(result.discordUrl).toBe('')
      expect(result.internUrl).toContain('https://gmod-integration.com/screenshots/')
    })

    it('defaults the format to jpeg when captureData.format is missing', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})

      const result = await saveScreenshot(jpeg, {}, fakePlayer, makeServer(), undefined)

      expect(result.filename).toContain('.jpeg')
    })

    it('stops before registration or publication when the S3 upload fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('s3 down'))
      await expect(saveScreenshot(jpeg, { format: 'png' }, fakePlayer, makeServer(), 'title')).rejects.toThrow(
        's3 down',
      )
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
      expect(enqueueMainClientUploadScreenshotMock).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('uploads to the configured Discord channel and returns its URL', async () => {
      const { ConfigServer } = await import('@gmod/config')
      const original = (ConfigServer as any).screenshotChannel
      ;(ConfigServer as any).screenshotChannel = 'ch1'
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      enqueueMainClientUploadScreenshotMock.mockResolvedValueOnce('https://discord.example/file.jpeg')

      try {
        const result = await saveScreenshot(jpeg, { format: 'jpeg' }, fakePlayer, makeServer(), 'title')
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
        const result = await saveScreenshot(jpeg, { format: 'jpeg' }, fakePlayer, makeServer(), 'title')
        expect(result.discordUrl).toBe('')
      } finally {
        ;(ConfigServer as any).screenshotChannel = original
      }
    })
  })

  describe('sendScreenshotToDiscord', () => {
    it('does not inspect channels or publish a screenshot belonging to an erased player', async () => {
      isErasureBlockedMock.mockResolvedValueOnce(true)
      const server = makeServer()
      expect(await sendScreenshotToDiscord('durl', 'iurl', 'private.jpeg', fakePlayer, server, 'Private')).toEqual({
        skip: true,
        message: 'Personal data collection is disabled',
      })
      expect(server.getScreenshotsChannel).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })
    it('skips when the server has no screenshots channel configured', async () => {
      const server = makeServer({ getScreenshotsChannel: vi.fn().mockResolvedValue(null) })
      const result = await sendScreenshotToDiscord('durl', 'iurl', 'file.jpeg', fakePlayer, server, 'title')
      expect(result).toEqual({ skip: true, message: 'Channel not found' })
    })

    it('does not publish an embed with an empty attachment URL', async () => {
      await expect(
        sendScreenshotToDiscord(
          '',
          'https://gmod-integration.com/capture',
          'file.jpeg',
          fakePlayer,
          makeServer(),
          'title',
        ),
      ).rejects.toThrow('Discord screenshot upload unavailable')
      expect(fetch).not.toHaveBeenCalled()
    })

    it.each([401, 404, 429, 500])('does not report a relay HTTP %s response as delivered', async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
      await expect(
        sendScreenshotToDiscord(
          'https://cdn.example/capture.jpeg',
          'https://gmod-integration.com/capture',
          'file.jpeg',
          fakePlayer,
          makeServer(),
          'title',
        ),
      ).rejects.toThrow('Discord screenshot delivery could not be confirmed')
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('sends the embed via the relay using the given title', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      const server = makeServer()

      const result = await sendScreenshotToDiscord(
        'https://cdn.example/durl.png',
        'https://gmod-integration.com/iurl',
        'file.jpeg',
        fakePlayer,
        server,
        'My title',
      )

      expect(fetchMock).toHaveBeenCalledWith('https://relay.example', expect.objectContaining({ method: 'POST' }))
      expect(result).toEqual({ success: true })
    })

    it('falls back to the translated default title when none is given', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      const server = makeServer()

      await sendScreenshotToDiscord(
        'https://cdn.example/durl.png',
        'https://gmod-integration.com/iurl',
        'file.jpeg',
        fakePlayer,
        server,
        undefined,
      )

      expect(getTranslateMock).toHaveBeenCalledWith('discord.screenshot.no_title', 'No title')
    })
  })

  describe('uploadScreenshotPayload', () => {
    const payload = () => ({ player: fakePlayer, screenshot: jpeg, captureData: { format: 'jpeg' }, size: '1KB' })
    async function withUploadChannel(operation: () => Promise<void>) {
      const { ConfigServer } = await import('@gmod/config')
      const original = ConfigServer.screenshotChannel
      ConfigServer.screenshotChannel = 'ch1'
      try {
        await operation()
      } finally {
        ConfigServer.screenshotChannel = original
      }
    }

    it('does not acknowledge persistence when screenshot storage fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('private storage failure'))
      await expect(uploadScreenshotPayload(makeServer(), payload())).rejects.toThrow('private storage failure')
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('acknowledges the saved panel capture separately from an unconfigured Discord destination', async () => {
      const server = makeServer({ getScreenshotsChannel: vi.fn().mockResolvedValue(null) })
      expect(await uploadScreenshotPayload(server, payload())).toEqual({
        success: true,
        saved: true,
        discordDelivered: false,
        delivery: 'not_configured',
      })
      expect(prismaMock.gm_server_screenshots.create).toHaveBeenCalledTimes(1)
      expect(fetch).not.toHaveBeenCalled()
      expect(prismaMock.gm_server_screenshots.deleteMany).not.toHaveBeenCalled()
    })

    it.each(['missing', 'empty', 'failed'])(
      'preserves the panel capture when Discord upload is %s',
      async (failure) => {
        await withUploadChannel(async () => {
          if (failure === 'failed')
            enqueueMainClientUploadScreenshotMock.mockRejectedValueOnce(new Error('worker failed'))
          else enqueueMainClientUploadScreenshotMock.mockResolvedValueOnce(failure === 'empty' ? '' : undefined)
          expect(await uploadScreenshotPayload(makeServer(), payload())).toEqual({
            success: true,
            saved: true,
            discordDelivered: false,
            delivery: 'unavailable',
          })
          expect(prismaMock.gm_server_screenshots.create).toHaveBeenCalledTimes(1)
          expect(prismaMock.gm_server_screenshots.deleteMany).not.toHaveBeenCalled()
          expect(fetch).not.toHaveBeenCalled()
        })
      },
    )

    it.each(['http', 'network'])(
      'retains a saved screenshot after a %s publication failure without replaying it',
      async (failure) => {
        await withUploadChannel(async () => {
          enqueueMainClientUploadScreenshotMock.mockResolvedValueOnce('https://cdn.example/capture.jpeg')
          const network = vi.fn()
          if (failure === 'http') network.mockResolvedValue({ ok: false, status: 530 })
          else network.mockRejectedValue(new Error('private relay response'))
          vi.stubGlobal('fetch', network)
          expect(await uploadScreenshotPayload(makeServer(), payload())).toEqual({
            success: true,
            saved: true,
            discordDelivered: false,
            delivery: 'unavailable',
          })
          expect(network).toHaveBeenCalledTimes(1)
          expect(prismaMock.gm_server_screenshots.create).toHaveBeenCalledTimes(1)
          expect(prismaMock.gm_server_screenshots.deleteMany).not.toHaveBeenCalled()
        })
      },
    )

    it('returns a controlled validation error without storage or publication for invalid image bytes', async () => {
      expect(
        await uploadScreenshotPayload(makeServer(), {
          player: fakePlayer,
          screenshot: 'AAAA',
          captureData: { format: 'png' },
          size: '1KB',
        }),
      ).toEqual({ error: 'invalid_screenshot' })
      expect(s3SendMock).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('does not upload or save a screenshot when collection is already disabled', async () => {
      isErasureBlockedMock.mockResolvedValueOnce(true)
      expect(
        await uploadScreenshotPayload(makeServer(), {
          player: fakePlayer,
          screenshot: 'AAAA',
          captureData: { format: 'jpeg' },
          size: 100,
        }),
      ).toEqual({
        skip: true,
        message: 'Personal data collection is disabled',
      })
      expect(s3SendMock).not.toHaveBeenCalled()
      expect(enqueueMainClientUploadScreenshotMock).not.toHaveBeenCalled()
      expect(prismaMock.gm_server_screenshots.create).not.toHaveBeenCalled()
    })
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
          screenshot: jpeg,
          captureData: { format: 'jpeg' },
          size: 100,
          title: 'title',
        })

        expect(result).toEqual({ success: true, saved: true, discordDelivered: true })
      } finally {
        ;(ConfigServer as any).screenshotChannel = original
      }
    })
  })

  describe('reportBugPayload', () => {
    const validBug = {
      player: fakePlayer,
      description: 'desc',
      importance: 'high',
      steps: 'steps',
      expected: 'expected',
      actual: 'actual',
    }
    it.each(['none', 'saved', 'failed'] as const)(
      'queues only the trusted saved identity after persistence, with attachment outcome %s',
      async (attachment) => {
        bugReportChannelMock.mockResolvedValueOnce({ channelID: '333333333333333333' })
        prismaMock.gm_server_report_bugs.create.mockImplementationOnce(async () => {
          expect(enqueueBugReportMock).not.toHaveBeenCalled()
          return { id: 42 }
        })
        s3SendMock.mockResolvedValue({})
        prismaMock.gm_server_screenshots.create.mockResolvedValue({})
        const screenshot = attachment === 'none' ? undefined : attachment === 'saved' ? bugCapture() : { invalid: true }
        expect(
          await reportBugPayload(makeServer(), { ...validBug, screenshot, serverID: 'foreign', reportID: 999 }),
        ).toEqual({
          success: true,
          saved: true,
          attachment,
        })
        expect(bugReportChannelMock).toHaveBeenCalledExactlyOnceWith('s1')
        expect(enqueueBugReportMock).toHaveBeenCalledExactlyOnceWith('s1', 42)
      },
    )
    it('does not queue a notification without a configured destination', async () => {
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 42 })
      expect(await reportBugPayload(makeServer(), validBug)).toMatchObject({ saved: true })
      expect(enqueueBugReportMock).not.toHaveBeenCalled()
    })
    it.each(['configuration', 'queue'])(
      'preserves the saved report and acknowledgement after a %s failure',
      async (stage) => {
        prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 42 })
        if (stage === 'configuration') bugReportChannelMock.mockRejectedValueOnce(new Error('private details'))
        else {
          bugReportChannelMock.mockResolvedValueOnce({ channelID: '333333333333333333' })
          enqueueBugReportMock.mockRejectedValueOnce(new Error('private details'))
        }
        expect(await reportBugPayload(makeServer(), validBug)).toEqual({
          success: true,
          saved: true,
          attachment: 'none',
        })
        expect(logMock).toHaveBeenCalledExactlyOnceWith(
          'warn',
          'A bug report was saved, but its Discord notification could not be queued.',
        )
      },
    )
    it('does not queue anything after a failed report write', async () => {
      prismaMock.gm_server_report_bugs.create.mockRejectedValueOnce(new Error('storage unavailable'))
      await expect(reportBugPayload(makeServer(), validBug)).rejects.toThrow('storage unavailable')
      expect(enqueueBugReportMock).not.toHaveBeenCalled()
      expect(bugReportChannelMock).not.toHaveBeenCalled()
    })
    it('does not register a private report or screenshot when collection is already disabled', async () => {
      isErasureBlockedMock.mockResolvedValueOnce(true)
      expect(
        await reportBugPayload(makeServer(), {
          player: fakePlayer,
          description: 'Private',
          importance: 'high',
          steps: 'steps',
          expected: 'expected',
          actual: 'actual',
        }),
      ).toEqual({ skip: true, message: 'Personal data collection is disabled' })
      expect(s3SendMock).not.toHaveBeenCalled()
      expect(prismaMock.gm_server_report_bugs.create).not.toHaveBeenCalled()
      expect(enqueueBugReportMock).not.toHaveBeenCalled()
    })
    it('removes exactly the bug report whose deferred write finishes after erasure starts', async () => {
      let blocked = false
      isErasureBlockedMock.mockImplementation(async () => blocked)
      let resolveWrite!: (report: { id: number }) => void
      prismaMock.gm_server_report_bugs.create.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveWrite = resolve
          }),
      )
      const operation = reportBugPayload(makeServer(), {
        player: fakePlayer,
        description: 'desc',
        importance: 'high',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
      })
      await vi.waitFor(() => expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledOnce())
      blocked = true
      resolveWrite({ id: 42 })
      await expect(operation).resolves.toMatchObject({ skip: true })
      expect(prismaMock.gm_server_report_bugs.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: 42 } })
      expect(enqueueBugReportMock).not.toHaveBeenCalled()
    })
    it('returns a missing_arguments error when required fields are absent', async () => {
      const result = await reportBugPayload(makeServer(), { player: fakePlayer })
      expect(result).toEqual(expect.objectContaining({ error: 'missing_arguments' }))
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
      expect(result).toEqual({ success: true, saved: true, attachment: 'none' })
    })

    it.each([
      null,
      [],
      'private malformed capture',
      { invalid: true },
      { screenshot: jpeg },
      { ...bugCapture(), size: undefined },
    ])(
      'accepts the report but explicitly marks malformed or incomplete attachment metadata as failed',
      async (screenshot) => {
        prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1, description: 'private report' })
        const result = await reportBugPayload(makeServer(), {
          player: fakePlayer,
          description: 'desc',
          importance: 'high',
          steps: 'steps',
          expected: 'expected',
          actual: 'actual',
          screenshot,
        })
        expect(result).toEqual({ success: true, saved: true, attachment: 'failed' })
        expect(s3SendMock).not.toHaveBeenCalled()
        expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ data: expect.objectContaining({ screenshot: '' }) }),
        )
      },
    )

    it('treats an empty legacy attachment table as an intentionally unsubmitted capture', async () => {
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1 })
      expect(
        await reportBugPayload(makeServer(), {
          player: fakePlayer,
          description: 'desc',
          importance: 'high',
          steps: 'steps',
          expected: 'expected',
          actual: 'actual',
          screenshot: {},
        }),
      ).toEqual({ success: true, saved: true, attachment: 'none' })
      expect(s3SendMock).not.toHaveBeenCalled()
    })

    it('saves the screenshot and includes its filename when all sub-fields are present', async () => {
      s3SendMock.mockResolvedValueOnce({})
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1 })

      const result = await reportBugPayload(makeServer(), {
        player: fakePlayer,
        description: 'desc',
        importance: 'high',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
        screenshot: bugCapture(),
      })

      expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenshot: expect.stringContaining('.jpeg') }) }),
      )
      expect(result).toEqual({ success: true, saved: true, attachment: 'saved' })
    })

    it.each(['bucket', 'object', 'metadata'])(
      'retains the report when screenshot %s storage fails without leaking an exception',
      async (stage) => {
        const failure = new Error('private screenshot bytes, report contents and storage credentials')
        if (stage === 'bucket') createBucketIfNotExistsMock.mockRejectedValueOnce(failure)
        if (stage === 'object') s3SendMock.mockRejectedValueOnce(failure)
        if (stage === 'metadata') prismaMock.gm_server_screenshots.create.mockRejectedValueOnce(failure)
        prismaMock.gm_server_report_bugs.create.mockResolvedValueOnce({ id: 1, description: 'private report' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const result = await reportBugPayload(makeServer(), {
          player: fakePlayer,
          description: 'desc',
          importance: 'high',
          steps: 'steps',
          expected: 'expected',
          actual: 'actual',
          screenshot: bugCapture(),
        })
        expect(result).toEqual({ success: true, saved: true, attachment: 'failed' })
        expect(errorSpy).not.toHaveBeenCalled()
        expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ data: expect.objectContaining({ screenshot: '' }) }),
        )
        errorSpy.mockRestore()
      },
    )
  })
})
