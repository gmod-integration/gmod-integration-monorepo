import { z } from 'zod'

export const StatusPreviewSettingsSchema = z
  .object({
    show_player_list_status: z.boolean().optional(),
    status_player_list_format: z.string().max(500).optional(),
    show_status_chart: z.boolean().optional(),
  })
  .strict()

export const StatusPreviewButtonSchema = z
  .object({
    id: z.number().int().nonnegative().optional(),
    name: z.string().max(80),
    emoji: z.string().max(100),
    // Empty fields are allowed while editing an inactive/incomplete button.
    url: z.string().max(2048),
    enable: z.boolean(),
  })
  .strict()

export const StatusMessagePreviewInputSchema = z
  .object({
    settings: StatusPreviewSettingsSchema.default({}),
    buttons: z.array(StatusPreviewButtonSchema).max(25).optional(),
    simulation: z.boolean().optional(),
    locale: z.enum(['en', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'ru', 'tr']).optional(),
  })
  .strict()

export const StatusMessagePreviewSchema = z.object({
  bot: z.object({ name: z.string(), avatarUrl: z.string().url().nullable() }),
  accessState: z.enum(['ready', 'unknown']).optional(),
  simulation: z.boolean().optional(),
  online: z.boolean(),
  embeds: z
    .array(
      z.object({
        title: z.string(),
        color: z.number().int().min(0).max(0xffffff),
        fields: z.array(z.object({ name: z.string(), value: z.string(), inline: z.boolean() })),
        timestamp: z.string().datetime(),
        imageUrl: z
          .string()
          .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
          .nullable(),
      }),
    )
    .min(1),
  buttonRows: z
    .array(
      z
        .array(
          z.object({
            label: z.string(),
            emoji: z.string().nullable(),
            url: z.string(),
          }),
        )
        .max(5),
    )
    .max(5),
})

export type StatusPreviewSettings = z.infer<typeof StatusPreviewSettingsSchema>
export type StatusPreviewButton = z.infer<typeof StatusPreviewButtonSchema>
export type StatusMessagePreviewInput = z.infer<typeof StatusMessagePreviewInputSchema>
export type StatusMessagePreview = z.infer<typeof StatusMessagePreviewSchema>
