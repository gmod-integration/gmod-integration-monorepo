import { z } from 'zod'

export const StatusConfigurationButtonSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(80),
    emoji: z.string().max(100),
    url: z
      .string()
      .trim()
      .max(2048)
      .url()
      .refine((value) => {
        try {
          return ['http:', 'https:'].includes(new URL(value).protocol)
        } catch {
          return false
        }
      }, 'Use an HTTP or HTTPS URL.'),
    enable: z.boolean(),
  })
  .strict()

export const StatusConfigurationSchema = z
  .object({
    settings: z
      .object({
        show_player_list_status: z.boolean(),
        status_player_list_format: z.string().max(255),
        show_status_chart: z.boolean(),
      })
      .strict(),
    buttons: z.array(StatusConfigurationButtonSchema).max(25),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.buttons.flatMap((button) => (button.id === undefined ? [] : [button.id]))
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['buttons'], message: 'A button may only occur once.' })
  })

// Read legacy incomplete buttons so the editor can repair them; writes always validate fully.
const readableConfiguration = z
  .object({
    settings: z
      .object({
        show_player_list_status: z.boolean(),
        status_player_list_format: z.string().max(255),
        show_status_chart: z.boolean(),
      })
      .strict(),
    buttons: z
      .array(
        z
          .object({
            id: z.number().int().positive().optional(),
            name: z.string().max(255),
            emoji: z.string().max(255),
            url: z.string().max(16384),
            enable: z.boolean(),
          })
          .strict(),
      )
      .max(25),
  })
  .strict()

export const StatusConfigurationSnapshotSchema = z
  .object({
    configuration: readableConfiguration,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export const StatusConfigurationSaveSchema = StatusConfigurationSnapshotSchema.extend({
  configuration: StatusConfigurationSchema,
})

export const StatusConfigurationSaveResponseSchema = StatusConfigurationSnapshotSchema.extend({
  sync: z.enum(['applied', 'pending', 'not_published']),
})

export type StatusConfiguration = z.infer<typeof StatusConfigurationSchema>
export type StatusConfigurationButton = z.infer<typeof StatusConfigurationButtonSchema>
export type StatusConfigurationSnapshot = z.infer<typeof StatusConfigurationSnapshotSchema>
export type StatusConfigurationSaveResponse = z.infer<typeof StatusConfigurationSaveResponseSchema>
