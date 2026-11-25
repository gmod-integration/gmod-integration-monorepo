import { z } from 'zod'

const serverID = z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/)

export const ConsoleViewerRequestSchema = z
  .object({
    action: z.enum(['console_subscribe', 'console_unsubscribe']),
    data: z.object({ serverID }).strict(),
  })
  .strict()

export const ConsoleSubscriptionSchema = z
  .object({
    action: z.literal('console_subscription'),
    serverID,
    enabled: z.boolean(),
    error: z.enum(['forbidden', 'unavailable', 'server_offline']).optional(),
  })
  .strict()

export const ConsoleOutputSchema = z
  .object({
    action: z.literal('console_live_exporter'),
    serverID,
    data: z.object({ data: z.string().max(32_768) }).strict(),
  })
  .strict()

export const ConsoleStreamCommandSchema = z.discriminatedUnion('enabled', [
  z
    .object({
      method: z.literal('wsConsoleStream'),
      enabled: z.literal(true),
      expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z.object({ method: z.literal('wsConsoleStream'), enabled: z.literal(false), expiresAt: z.literal(0) }).strict(),
])

export type ConsoleViewerRequest = z.infer<typeof ConsoleViewerRequestSchema>
export type ConsoleSubscription = z.infer<typeof ConsoleSubscriptionSchema>
export type ConsoleOutput = z.infer<typeof ConsoleOutputSchema>
export type ConsoleStreamCommand = z.infer<typeof ConsoleStreamCommandSchema>

export const ConsoleRconRequestSchema = z
  .object({
    requestID: z.string().uuid(),
    command: z
      .string()
      .max(8192)
      .regex(/^[^\0\r\n]+$/)
      .trim()
      .min(1)
      .refine((value) => new TextEncoder().encode(value).length <= 8192, 'The command exceeds 8192 UTF-8 bytes.'),
  })
  .strict()

const rconResponse = z.object({ serverID, requestID: z.string().uuid() })
export const ConsoleRconResponseSchema = z.discriminatedUnion('status', [
  rconResponse.extend({ status: z.literal('executed'), code: z.literal('executed') }).strict(),
  rconResponse
    .extend({
      status: z.literal('rejected'),
      code: z.enum(['permission_denied', 'expired', 'execution_failed']),
    })
    .strict(),
  rconResponse.extend({ status: z.literal('unknown'), code: z.literal('delivery_uncertain') }).strict(),
])

export type ConsoleRconRequest = z.infer<typeof ConsoleRconRequestSchema>
export type ConsoleRconResponse = z.infer<typeof ConsoleRconResponseSchema>
