import { z } from 'zod'
import { GmodCaptureDataSchema } from './GmodCaptureDataSchema.js'

/** Validate the optional attachment separately so it cannot discard an otherwise accepted report. */
export const GmodBugReportAttachmentSchema = z.object({
  screenshot: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024),
  captureData: GmodCaptureDataSchema.extend({
    w: z.number().int().min(1).max(16_384),
    h: z.number().int().min(1).max(16_384),
    x: z.number().int().min(0).max(16_384),
    y: z.number().int().min(0).max(16_384),
    quality: z.number().int().min(0).max(100),
  }),
  size: z.union([z.string().min(1).max(64), z.number().finite().nonnegative()]),
})

/** The player only needs a bounded delivery outcome, never the stored report or screenshot. */
export const GmodBugReportAcknowledgementSchema = z
  .object({
    success: z.literal(true),
    saved: z.literal(true),
    attachment: z.enum(['none', 'saved', 'failed']),
  })
  .strict()

export type GmodBugReportAcknowledgement = z.infer<typeof GmodBugReportAcknowledgementSchema>
