import sharp from 'sharp'
import { CustomBotAvatarSchema, CUSTOM_BOT_AVATAR_MAX_BYTES } from '@gmod/schema/server/CustomBotProfileSchema.js'

/** Decode bounded raster uploads and give the SDK bytes, never a resource-resolving string. */
export async function prepareCustomBotAvatar(raw: string): Promise<Buffer> {
  const value = CustomBotAvatarSchema.parse(raw)
  const separator = value.indexOf(',')
  const encoded = value.slice(separator + 1)
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > CUSTOM_BOT_AVATAR_MAX_BYTES || bytes.toString('base64') !== encoded)
    throw new Error('Invalid avatar upload.')
  const isPNG = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJPEG = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if ((!isPNG && !isJPEG) || (value.startsWith('data:image/png;') ? !isPNG : !isJPEG))
    throw new Error('Invalid avatar image.')
  const image = sharp(bytes, { limitInputPixels: 16_777_216, failOn: 'error' })
  const metadata = await image.metadata()
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 4096 ||
    metadata.height > 4096 ||
    (metadata.pages ?? 1) !== 1 ||
    (metadata.format !== 'png' && metadata.format !== 'jpeg')
  )
    throw new Error('Invalid avatar dimensions or format.')
  return image.rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
}
