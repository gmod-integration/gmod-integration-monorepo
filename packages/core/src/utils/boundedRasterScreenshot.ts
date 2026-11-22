import sharp from 'sharp'

// Base64 stays below the HTTP body and addon frame budgets; this permits normal 4K game captures.
export const SCREENSHOT_MAX_BASE64_LENGTH = 10 * 1024 * 1024
export const SCREENSHOT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024
export const SCREENSHOT_MAX_DIMENSION = 8192
export const SCREENSHOT_MAX_PIXELS = 32_000_000

export class ScreenshotValidationError extends Error {
  readonly code = 'invalid_screenshot'
  constructor(message = 'Invalid screenshot image.') {
    super(message)
    this.name = 'ScreenshotValidationError'
  }
}

/** Canonical base64 raster bytes only. Sharp never receives a URL or filesystem path. */
export async function prepareRasterScreenshot(input: unknown, format: 'jpeg' | 'png'): Promise<Buffer> {
  if (format !== 'jpeg' && format !== 'png') throw new ScreenshotValidationError('Unsupported screenshot format.')
  if (typeof input !== 'string' || input.length > SCREENSHOT_MAX_BASE64_LENGTH + 23)
    throw new ScreenshotValidationError('Screenshot exceeds the upload limit.')
  let encoded = input
  let declaredFormat: 'jpeg' | 'png' | undefined
  if (input.startsWith('data:')) {
    const prefix = /^data:image\/(jpeg|png);base64,/.exec(input)
    if (!prefix) throw new ScreenshotValidationError()
    declaredFormat = prefix[1] as 'jpeg' | 'png'
    encoded = input.slice(prefix[0].length)
  }
  if (
    encoded.length === 0 ||
    encoded.length > SCREENSHOT_MAX_BASE64_LENGTH ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new ScreenshotValidationError()
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) throw new ScreenshotValidationError()
  const isPNG = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJPEG = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if ((!isPNG && !isJPEG) || (declaredFormat === 'png' && !isPNG) || (declaredFormat === 'jpeg' && !isJPEG))
    throw new ScreenshotValidationError()
  try {
    const image = sharp(bytes, { limitInputPixels: SCREENSHOT_MAX_PIXELS, failOn: 'error' })
    const metadata = await image.metadata()
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > SCREENSHOT_MAX_DIMENSION ||
      metadata.height > SCREENSHOT_MAX_DIMENSION ||
      metadata.width * metadata.height > SCREENSHOT_MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1 ||
      (metadata.format !== 'png' && metadata.format !== 'jpeg')
    )
      throw new ScreenshotValidationError('Screenshot dimensions or format are not supported.')
    // Encoding strips EXIF, profiles and trailing data; never persist the original user-supplied bytes.
    const normalized = image.rotate()
    const output = await (
      format === 'png'
        ? normalized.png({ compressionLevel: 6 })
        : normalized.jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    ).toBuffer()
    if (output.length > SCREENSHOT_MAX_OUTPUT_BYTES)
      throw new ScreenshotValidationError('Screenshot exceeds the output limit.')
    return output
  } catch (error) {
    if (error instanceof ScreenshotValidationError) throw error
    throw new ScreenshotValidationError()
  }
}
