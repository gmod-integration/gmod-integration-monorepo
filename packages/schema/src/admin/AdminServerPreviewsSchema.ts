import { z } from 'zod'
import { AdminIDSchema } from './AdminDashboardSchema.js'

export const AdminPreviewQuerySchema = z.object({ locale: z.enum(['en', 'fr']).default('en') }).strict()
export const AdminServerPreviewsSchema = z
  .object({
    server: z.object({ id: AdminIDSchema, name: z.string(), guildID: AdminIDSchema }).strict(),
    screenshots: z
      .array(
        z
          .object({
            id: z.number().int().nonnegative(),
            title: z.string().max(255),
            url: z.string().url(),
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(6),
    generatedAt: z.string().datetime(),
  })
  .strict()
export type AdminServerPreviews = z.infer<typeof AdminServerPreviewsSchema>
