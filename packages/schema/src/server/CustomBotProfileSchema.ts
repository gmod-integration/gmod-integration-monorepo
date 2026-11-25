import { z } from 'zod'

export const CUSTOM_BOT_AVATAR_MAX_BYTES = 2 * 1024 * 1024
const MAX_ENCODED_LENGTH = Math.ceil(CUSTOM_BOT_AVATAR_MAX_BYTES / 3) * 4

/** Only uploaded raster bytes are accepted, never a URL or a filesystem path. */
export const CustomBotAvatarSchema = z
  .string()
  .max(MAX_ENCODED_LENGTH + 23)
  .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => {
    const encoded = value.slice(value.indexOf(',') + 1)
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
    return encoded.length % 4 === 0 && (encoded.length / 4) * 3 - padding <= CUSTOM_BOT_AVATAR_MAX_BYTES
  }, 'Choose a PNG or JPEG image up to 2 MiB.')

export const CustomBotProfileCommandSchema = z
  .object({
    username: z.string().trim().min(2).max(32).optional(),
    avatar: CustomBotAvatarSchema.optional(),
    status: z.enum(['disabled', 'guildMemberCount', 'playerCount', 'rotate']).optional(),
  })
  .strict()
  .refine(
    (value) => value.username !== undefined || value.avatar !== undefined || value.status !== undefined,
    'Choose a profile change.',
  )
export type CustomBotProfileCommand = z.infer<typeof CustomBotProfileCommandSchema>

export const CustomBotTokenCommandSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9._-]+$/),
  })
  .strict()

/** Read responses project configuration state and never include the bot credential. */
export const CustomBotInfoSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    avatar: z.string().nullable(),
    status: z.string(),
    custom: z.boolean(),
    purchased: z.boolean(),
    onGuild: z.boolean(),
    active: z.boolean(),
    tokenConfigured: z.boolean(),
  })
  .strict()
export type CustomBotInfo = z.infer<typeof CustomBotInfoSchema>
