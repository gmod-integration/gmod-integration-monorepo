import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  prepareRasterScreenshot,
  ScreenshotValidationError,
  SCREENSHOT_MAX_BASE64_LENGTH,
} from '../../src/utils/boundedRasterScreenshot.js'

const smallPNG = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#335577' } })
  .png()
  .toBuffer()
const encode = (bytes: Buffer, format?: string) =>
  `${format ? `data:image/${format};base64,` : ''}${bytes.toString('base64')}`

describe('bounded raster screenshot storage', () => {
  it.each(['jpeg', 'png'] as const)(
    'decodes and re-encodes %s image bytes without retaining image metadata or trailing content',
    async (format) => {
      const input = await sharp(smallPNG).withMetadata({ orientation: 1 }).toFormat(format).toBuffer()
      const marked = Buffer.concat([input, Buffer.from('trailing-content-marker')])
      const output = await prepareRasterScreenshot(encode(marked, format), format)
      const metadata = await sharp(output).metadata()
      expect(metadata).toMatchObject({ format, width: 32, height: 16 })
      expect(metadata.exif).toBeUndefined()
      expect(metadata.icc).toBeUndefined()
      expect(output.includes(Buffer.from('trailing-content-marker'))).toBe(false)
      expect(output.equals(marked)).toBe(false)
    },
  )
  it('accepts plain inline base64 from the addon and converts to the selected capture format', async () => {
    const result = await prepareRasterScreenshot(encode(smallPNG), 'jpeg')
    expect(await sharp(result).metadata()).toMatchObject({ format: 'jpeg', width: 32, height: 16 })
  })
  it('accepts a valid 4K game capture within the pixel and byte budgets', async () => {
    const capture = await sharp({ create: { width: 3840, height: 2160, channels: 3, background: '#224466' } })
      .jpeg()
      .toBuffer()
    const output = await prepareRasterScreenshot(encode(capture), 'jpeg')
    expect(await sharp(output).metadata()).toMatchObject({ width: 3840, height: 2160, format: 'jpeg' })
  })
  it.each([
    undefined,
    null,
    {},
    ['AAAA'],
    '',
    'AAAA',
    'AAB=',
    'AA==\n',
    'https://example.test/capture.png',
    '/tmp/capture.png',
    'file:///tmp/capture.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,PHN2Zy8+',
  ])('refuses invalid encoding or non-raster sources before native decoding', async (input) => {
    await expect(prepareRasterScreenshot(input, 'png')).rejects.toBeInstanceOf(ScreenshotValidationError)
  })
  it('rejects a declared MIME type that does not match the input raster signature', async () => {
    await expect(prepareRasterScreenshot(encode(smallPNG, 'jpeg'), 'jpeg')).rejects.toBeInstanceOf(
      ScreenshotValidationError,
    )
  })
  it('rejects excessive base64 size before allocating a decoded image buffer', async () => {
    await expect(prepareRasterScreenshot('A'.repeat(SCREENSHOT_MAX_BASE64_LENGTH + 4), 'png')).rejects.toBeInstanceOf(
      ScreenshotValidationError,
    )
  })
  it('rejects excessive dimensions and decoded pixels while retaining a controlled validation error', async () => {
    const tooWide = await sharp({ create: { width: 8193, height: 1, channels: 3, background: 'white' } })
      .png()
      .toBuffer()
    await expect(prepareRasterScreenshot(encode(tooWide), 'png')).rejects.toBeInstanceOf(ScreenshotValidationError)
    const tooManyPixels = await sharp({ create: { width: 8192, height: 4096, channels: 3, background: 'white' } })
      .png()
      .toBuffer()
    await expect(prepareRasterScreenshot(encode(tooManyPixels), 'png')).rejects.toBeInstanceOf(
      ScreenshotValidationError,
    )
  })
})
