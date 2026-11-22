import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { prepareCustomBotAvatar } from '../../../src/discord/utils/customBotAvatar.js'

const dataURL = (bytes: Buffer, format = 'png') => `data:image/${format};base64,${bytes.toString('base64')}`

describe('uploaded custom bot avatars', () => {
  it.each(['png', 'jpeg'] as const)(
    'decodes and re-encodes a %s image into bounded PNG bytes without fetching resources',
    async (format) => {
      const request = vi.fn()
      vi.stubGlobal('fetch', request)
      try {
        const input = await sharp({ create: { width: 1200, height: 600, channels: 4, background: '#123456' } })
          .toFormat(format)
          .toBuffer()
        const output = await prepareCustomBotAvatar(dataURL(input, format))
        expect(Buffer.isBuffer(output)).toBe(true)
        const metadata = await sharp(output).metadata()
        expect(metadata).toMatchObject({ format: 'png', width: 512, height: 256 })
        expect(metadata.exif).toBeUndefined()
        expect(request).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )
  it.each([
    'https://example.test/avatar.png',
    'http://127.0.0.1/avatar',
    '/tmp/avatar.png',
    'file:///tmp/avatar.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,AA==',
  ])('refuses URL/path, active content and undecodable bytes: %s', async (input) => {
    await expect(prepareCustomBotAvatar(input)).rejects.toThrow()
  })
  it('rejects oversized dimensions and a MIME type that does not match the raster signature', async () => {
    const large = await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'white' } })
      .png()
      .toBuffer()
    await expect(prepareCustomBotAvatar(dataURL(large))).rejects.toThrow('dimensions')
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
      .png()
      .toBuffer()
    await expect(prepareCustomBotAvatar(dataURL(png, 'jpeg'))).rejects.toThrow('image')
  })
  it('rejects non-canonical base64 before decoding an avatar image', async () => {
    // The low padding bits are nonzero; permissive decoders accept these bytes but re-encode differently.
    await expect(prepareCustomBotAvatar('data:image/png;base64,iVBORw0KGgp=')).rejects.toThrow('avatar upload')
  })
  it('bounds height independently and refuses a JPEG declared as PNG', async () => {
    const tall = await sharp({ create: { width: 1, height: 4097, channels: 3, background: 'white' } })
      .png()
      .toBuffer()
    await expect(prepareCustomBotAvatar(dataURL(tall))).rejects.toThrow('dimensions')
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
      .jpeg()
      .toBuffer()
    await expect(prepareCustomBotAvatar(dataURL(jpeg, 'png'))).rejects.toThrow('image')
  })
})
