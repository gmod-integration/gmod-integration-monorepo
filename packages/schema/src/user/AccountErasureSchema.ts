import { z } from 'zod'

/** The receipt is generated before submission so a lost acknowledgement can be recovered. */
export const AccountErasureReceiptSchema = z.string().regex(/^[a-f0-9]{64}$/i)
export const AccountErasureRequestIdSchema = z.string().uuid()
export const AccountErasureStatusSchema = z.enum(['pending', 'running', 'retry', 'completed'])

export const AccountErasureRequestSchema = z
  .object({
    confirmation: z.literal('DELETE'),
    idempotencyKey: AccountErasureRequestIdSchema,
    receipt: AccountErasureReceiptSchema,
  })
  .strict()

/** Parsing an outgoing status also strips internal fields and credentials. */
export const AccountErasureStatusResponseSchema = z.object({
  requestId: AccountErasureRequestIdSchema,
  status: AccountErasureStatusSchema,
  requestedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
})

export const AccountErasureResponseSchema = AccountErasureStatusResponseSchema.extend({
  receipt: AccountErasureReceiptSchema,
})

export type AccountErasureRequest = z.infer<typeof AccountErasureRequestSchema>
export type AccountErasureStatus = z.infer<typeof AccountErasureStatusSchema>
export type AccountErasureStatusResponse = z.infer<typeof AccountErasureStatusResponseSchema>
export type AccountErasureResponse = z.infer<typeof AccountErasureResponseSchema>
