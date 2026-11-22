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
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueMainClientUploadScreenshot: enqueueMainClientUploadScreenshotMock,
}))

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

    it('logs and continues when the S3 upload fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('s3 down'))
      prismaMock.gm_server_screenshots.create.mockResolvedValueOnce({})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await saveScreenshot(jpeg, { format: 'png' }, fakePlayer, makeServer(), 'title')

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

        expect(result).toEqual({ success: true })
      } finally {
        ;(ConfigServer as any).screenshotChannel = original
      }
    })
  })

  describe('reportBugPayload', () => {
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
        screenshot: { screenshot: jpeg },
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
        screenshot: { screenshot: jpeg, captureData: { format: 'jpeg' }, size: 100 },
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
        screenshot: { screenshot: jpeg, captureData: { format: 'jpeg' }, size: 100 },
      })

      expect(errorSpy).toHaveBeenCalled()
      expect(prismaMock.gm_server_report_bugs.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenshot: '' }) }),
      )
    })
  })
})
