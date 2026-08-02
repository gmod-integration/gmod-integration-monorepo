import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3ServiceException } from '@aws-sdk/client-s3'
import type * as AwsS3Client from '@aws-sdk/client-s3'

const sendMock = vi.fn()

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof AwsS3Client>()
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(function (this: any) {
      this.send = sendMock
    }),
  }
})

vi.mock('@gmod/config', () => ({
  ConfigMinIO: {
    endpoint: 'http://127.0.0.1:9060',
    region: 'us-east-1',
    accessKey: 'test-access-key',
    secretKey: 'test-secret-key',
  },
  ConfigServer: { domain: 'https://api.gmod-integration.com' },
}))

function s3Error(name: string, httpStatusCode: number) {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode },
    message: name,
  } as any)
}

describe('packages/infra-minio src/index.ts', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('createBucketIfNotExists', () => {
    it('rejects an invalid bucket name without calling S3', async () => {
      const { createBucketIfNotExists } = await import('../src/index.js')
      await expect(createBucketIfNotExists('UPPERCASE_not_valid')).rejects.toThrow(/Invalid bucket name/)
      expect(sendMock).not.toHaveBeenCalled()
    })

    it('does nothing when the bucket already exists (HeadBucket succeeds)', async () => {
      sendMock.mockResolvedValueOnce({})
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).resolves.toBeUndefined()
      expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('creates the bucket when HeadBucket reports NotFound', async () => {
      sendMock.mockRejectedValueOnce(s3Error('NotFound', 404)).mockResolvedValueOnce({})
      const { createBucketIfNotExists } = await import('../src/index.js')

      await createBucketIfNotExists('my-bucket')
      expect(sendMock).toHaveBeenCalledTimes(2)
    })

    it('creates the bucket when HeadBucket reports NoSuchBucket', async () => {
      sendMock.mockRejectedValueOnce(s3Error('NoSuchBucket', 404)).mockResolvedValueOnce({})
      const { createBucketIfNotExists } = await import('../src/index.js')

      await createBucketIfNotExists('my-bucket')
      expect(sendMock).toHaveBeenCalledTimes(2)
    })

    it('rethrows when bucket creation itself fails after a NotFound (error with a name)', async () => {
      const createError = new Error('create failed')
      sendMock.mockRejectedValueOnce(s3Error('NotFound', 404)).mockRejectedValueOnce(createError)
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(createError)
    })

    it('logs via .message when the creation error has no .name', async () => {
      const createError = { message: 'create failed, no name' }
      sendMock.mockRejectedValueOnce(s3Error('NotFound', 404)).mockRejectedValueOnce(createError)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(createError)
      expect(errorSpy).toHaveBeenCalledWith('❌ Failed to create bucket:', 'create failed, no name')
    })

    it('logs the raw error when the creation error has neither .name nor .message', async () => {
      const createError = 'a plain string failure'
      sendMock.mockRejectedValueOnce(s3Error('NotFound', 404)).mockRejectedValueOnce(createError)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(createError)
      expect(errorSpy).toHaveBeenCalledWith('❌ Failed to create bucket:', 'a plain string failure')
    })

    it('treats BucketAlreadyOwnedByYou as success', async () => {
      sendMock.mockRejectedValueOnce(s3Error('BucketAlreadyOwnedByYou', 409))
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).resolves.toBeUndefined()
      expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('throws on BucketAlreadyExists (owned by someone else)', async () => {
      const err = s3Error('BucketAlreadyExists', 409)
      sendMock.mockRejectedValueOnce(err)
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(err)
    })

    it('rethrows on an unrecognized S3ServiceException code', async () => {
      const err = s3Error('AccessDenied', 403)
      sendMock.mockRejectedValueOnce(err)
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(err)
    })

    it('rethrows on a plain HTTP 400 error that is not an S3ServiceException', async () => {
      const err = Object.assign(new Error('bad request'), { $metadata: { httpStatusCode: 400 } })
      sendMock.mockRejectedValueOnce(err)
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(err)
    })

    it('rethrows on a completely unknown error shape', async () => {
      const err = new Error('mystery failure')
      sendMock.mockRejectedValueOnce(err)
      const { createBucketIfNotExists } = await import('../src/index.js')

      await expect(createBucketIfNotExists('my-bucket')).rejects.toBe(err)
    })
  })

  describe('getStoredAvatarUrl', () => {
    it('builds the public avatar URL, URL-encoding the id', async () => {
      const { getStoredAvatarUrl } = await import('../src/index.js')
      expect(getStoredAvatarUrl('discord', '123 456')).toBe(
        'https://api.gmod-integration.com/avatars/discord/123%20456',
      )
    })
  })

  describe('ensureAvatarStored', () => {
    it('returns null when remoteUrl is not provided', async () => {
      const { ensureAvatarStored } = await import('../src/index.js')
      expect(await ensureAvatarStored('discord', 'u1', null)).toBeNull()
      expect(await ensureAvatarStored('discord', 'u1', undefined)).toBeNull()
      expect(sendMock).not.toHaveBeenCalled()
    })

    it('skips upload and returns the stored URL when the avatar already exists', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadObjectCommand succeeds -> exists
      const { ensureAvatarStored } = await import('../src/index.js')

      const result = await ensureAvatarStored('discord', 'u1', 'https://cdn.discordapp.com/a.png')

      expect(result).toBe('https://api.gmod-integration.com/avatars/discord/u1')
      expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('uploads the avatar when it does not exist yet, then returns the stored URL', async () => {
      sendMock
        .mockRejectedValueOnce(s3Error('NotFound', 404)) // HeadObjectCommand -> not found
        .mockResolvedValueOnce({}) // HeadBucketCommand inside createBucketIfNotExists
        .mockResolvedValueOnce({}) // PutObjectCommand
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Map([['content-type', 'image/png']]),
          arrayBuffer: async () => new ArrayBuffer(4),
        }),
      )

      const { ensureAvatarStored } = await import('../src/index.js')
      const result = await ensureAvatarStored('discord', 'u1', 'https://cdn.discordapp.com/a.png')

      expect(result).toBe('https://api.gmod-integration.com/avatars/discord/u1')
      expect(sendMock).toHaveBeenCalledTimes(3)
    })

    it('returns the remote URL unchanged and logs when caching fails', async () => {
      sendMock.mockRejectedValueOnce(new Error('S3 is down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { ensureAvatarStored } = await import('../src/index.js')
      const result = await ensureAvatarStored('steam', 'u2', 'https://steamcdn.example.com/a.png')

      expect(result).toBe('https://steamcdn.example.com/a.png')
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to cache steam avatar'), expect.any(Error))
    })

    it('propagates a failed fetch as a caching failure (falls back to the remote URL)', async () => {
      sendMock.mockRejectedValueOnce(s3Error('NotFound', 404)).mockResolvedValueOnce({})
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const { ensureAvatarStored } = await import('../src/index.js')
      const result = await ensureAvatarStored('guild', 'u3', 'https://example.com/a.png')

      expect(result).toBe('https://example.com/a.png')
    })

    it('defaults the content type to image/webp when the response has none', async () => {
      sendMock.mockRejectedValueOnce(s3Error('NotFound', 404)).mockResolvedValueOnce({}).mockResolvedValueOnce({})
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: async () => new ArrayBuffer(2),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { ensureAvatarStored } = await import('../src/index.js')
      await ensureAvatarStored('discord', 'u4', 'https://example.com/a.png')

      expect(sendMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('replaceStoredAvatar', () => {
    it('returns null when remoteUrl is not provided', async () => {
      const { replaceStoredAvatar } = await import('../src/index.js')
      expect(await replaceStoredAvatar('discord', 'u1', null)).toBeNull()
    })

    it('always re-uploads (no existence check) and returns the stored URL', async () => {
      sendMock.mockResolvedValueOnce({}).mockResolvedValueOnce({})
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Map([['content-type', 'image/png']]),
          arrayBuffer: async () => new ArrayBuffer(4),
        }),
      )

      const { replaceStoredAvatar } = await import('../src/index.js')
      const result = await replaceStoredAvatar('discord', 'u1', 'https://cdn.discordapp.com/new.png')

      expect(result).toBe('https://api.gmod-integration.com/avatars/discord/u1')
      // HeadBucketCommand (inside createBucketIfNotExists) + PutObjectCommand, no HeadObjectCommand
      expect(sendMock).toHaveBeenCalledTimes(2)
    })

    it('returns the remote URL unchanged and logs when refreshing fails', async () => {
      sendMock.mockRejectedValueOnce(new Error('S3 is down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { replaceStoredAvatar } = await import('../src/index.js')
      const result = await replaceStoredAvatar('steam', 'u2', 'https://steamcdn.example.com/a.png')

      expect(result).toBe('https://steamcdn.example.com/a.png')
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh steam avatar'),
        expect.any(Error),
      )
    })
  })

  describe('deleteStoredAvatar', () => {
    it('deletes the avatar object', async () => {
      sendMock.mockResolvedValueOnce({})
      const { deleteStoredAvatar } = await import('../src/index.js')

      await deleteStoredAvatar('discord', 'u1')
      expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('swallows and logs errors instead of throwing', async () => {
      sendMock.mockRejectedValueOnce(new Error('delete failed'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { deleteStoredAvatar } = await import('../src/index.js')

      await expect(deleteStoredAvatar('discord', 'u1')).resolves.toBeUndefined()
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete discord avatar'), expect.any(Error))
    })
  })
})
