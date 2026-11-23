import { z } from 'zod'

export const PlayerAccessRefreshCommandSchema = z
  .object({
    method: z.literal('wsRefreshPlayerAccess'),
    steamID: z
      .string()
      .regex(/^\d{17}$/)
      .optional(),
  })
  .strict()

export const ADDON_PROTOCOL_VERSION = 1
export const ADDON_MAX_MESSAGE_BYTES = 12 * 1024 * 1024
export const ADDON_MAX_LOG_ENTRIES = 100

/** Check JSON iteratively so hostile nesting cannot exhaust a recursive schema parser. */
function isBoundedJSON(value: unknown): boolean {
  const pending = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  let characters = 0
  while (pending.length) {
    const entry = pending.pop()!
    if (++nodes > 32_768 || entry.depth > 24) return false
    const current = entry.value
    if (current === null || typeof current === 'boolean') continue
    if (typeof current === 'string') {
      characters += current.length
      if (characters > ADDON_MAX_MESSAGE_BYTES) return false
      continue
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return false
      continue
    }
    if (typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype) return false
    const entries = Object.entries(current)
    if (entries.length > 512) return false
    for (const [key, child] of entries) {
      characters += key.length
      if (characters > ADDON_MAX_MESSAGE_BYTES) return false
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false
      pending.push({ value: child, depth: entry.depth + 1 })
    }
  }
  return true
}

export const AddonRequestSchema = z
  .object({
    action: z.literal('addon.request'),
    id: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[a-zA-Z0-9_.:-]+$/),
    method: z.enum(['GET', 'POST']),
    endpoint: z
      .string()
      .min(1)
      .max(256)
      .regex(/^\/[a-zA-Z0-9_/?=:-]+$/),
    body: z.unknown().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.body !== undefined && !isBoundedJSON(request.body)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'Invalid or oversized JSON body' })
    }
    if (request.method === 'GET' && request.body !== undefined && request.body !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'GET requests have no body' })
    }
  })

export type AddonRequest = z.infer<typeof AddonRequestSchema>

export const AddonRconCommandSchema = z
  .object({
    method: z.literal('wsAuthorizedRcon'),
    requestID: z.string().uuid(),
    steamID: z.string().regex(/^\d{17}$/),
    command: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[^\0\r\n]+$/),
    expiresAt: z.number().int().positive(),
  })
  .strict()

export const AddonCommandResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      action: z.literal('addon.command-result'),
      id: z.string().uuid(),
      method: z.literal('wsAuthorizedRcon'),
      ok: z.literal(true),
      code: z.literal('executed'),
    })
    .strict(),
  z
    .object({
      action: z.literal('addon.command-result'),
      id: z.string().uuid(),
      method: z.literal('wsAuthorizedRcon'),
      ok: z.literal(false),
      code: z.enum(['permission_denied', 'expired', 'execution_failed']),
    })
    .strict(),
])

export type AddonCommandResult = z.infer<typeof AddonCommandResultSchema>
