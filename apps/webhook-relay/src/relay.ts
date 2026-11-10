import { createHash, timingSafeEqual } from 'node:crypto'
import { prometheus } from '@hono/prometheus'
import { AttachmentBuilder, RESTJSONErrorCodes } from 'discord.js'
import { Hono } from 'hono'
import { z } from 'zod'
import { createMetrics, type RelayMetrics } from './metrics.js'
import { WebhookBlacklist, WebhookClientCache, type WebhookSenderFactory } from './webhooks.js'

// Contract shared with the API's callers (packages/core: serversPlayersModels.ts, clientsModels.ts,
// utils/logger.ts): POST / with `{ webhookID, webhookToken, data }`, where `data` is a discord.js
// WebhookMessageCreateOptions object plus `filesToAdd` (inline text attachments).
const RelayRequestSchema = z.object({
  // Discord ids/tokens only ever use these characters. Checking them stops a value like
  // `../../something` from being spliced into the Discord API route discord.js builds from them.
  webhookID: z.string().regex(/^\d+$/),
  webhookToken: z.string().regex(/^[\w-]+$/),
  data: z
    .object({
      filesToAdd: z.array(z.object({ name: z.string().min(1), content: z.string() })).optional(),
    })
    .passthrough(),
})

// Discord answers these for a webhook that will never work again with the same id/token pair.
const DEAD_WEBHOOK_CODES = new Set<unknown>([RESTJSONErrorCodes.UnknownWebhook, RESTJSONErrorCodes.InvalidWebhookToken])

const BLACKLIST_MINUTES = 10

function sha256(value: string) {
  return createHash('sha256').update(value).digest()
}

/** `Authorization: <scheme> <token>`; the scheme isn't checked, same as the original relay. */
export function isAuthorized(header: string | undefined, expectedTokenDigest: Buffer) {
  const provided = header?.split(' ')[1]
  if (!provided) return false
  // Fixed-length digests, so the comparison time leaks neither the token's content nor its length.
  return timingSafeEqual(sha256(provided), expectedTokenDigest)
}

export interface RelayOptions {
  barerToken: string
  createSender: WebhookSenderFactory
  metrics?: RelayMetrics
  blacklist?: WebhookBlacklist
}

export function createRelay(options: RelayOptions) {
  const metrics = options.metrics ?? createMetrics()
  const blacklist = options.blacklist ?? new WebhookBlacklist(BLACKLIST_MINUTES * 60 * 1000)
  const cache = new WebhookClientCache(options.createSender)
  const expectedTokenDigest = sha256(options.barerToken)
  const { printMetrics, registerMetrics } = prometheus({ registry: metrics.registry })

  const app = new Hono()
  app.use('*', registerMetrics)
  app.get('/metrics', printMetrics)
  // Kept from the original relay: uptime checks hit `GET /`.
  app.get('/', (c) => c.text('Hello World'))

  app.post('/', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), expectedTokenDigest)) {
      console.warn('Rejected request: bad or missing bearer token')
      return c.json({ message: 'Unauthorized' }, 401)
    }

    let body: any
    try {
      body = await c.req.json()
    } catch {
      metrics.recordFailed()
      return c.json({ message: 'Invalid JSON body' }, 400)
    }

    if (!body?.webhookID || !body.webhookToken || !body.data) {
      metrics.recordFailed()
      return c.json({ message: 'Missing parameters' }, 400)
    }

    const parsed = RelayRequestSchema.safeParse(body)
    if (!parsed.success) {
      metrics.recordFailed()
      return c.json({ message: 'Invalid parameters' }, 400)
    }
    const { webhookID, webhookToken, data } = parsed.data

    if (blacklist.has(webhookID, webhookToken)) {
      metrics.recordFailed()
      return c.json({ message: 'Webhook temporarily disabled after previous failure' }, 400)
    }

    // A caller-supplied `files` is dropped, never forwarded: discord.js resolves string entries as
    // local paths or URLs, which would let a caller upload files from the relay host itself.
    // Attachments only come from `filesToAdd`, whose content travels inline in the request.
    const { filesToAdd, files: _files, ...message } = data
    const sendOptions = filesToAdd
      ? {
          ...message,
          files: filesToAdd.map(
            (file) => new AttachmentBuilder(Buffer.from(file.content, 'utf-8'), { name: file.name }),
          ),
        }
      : message

    try {
      const sent = await cache.get(webhookID, webhookToken).send(sendOptions)
      metrics.recordRelayed()
      return c.json(sent as any)
    } catch (err: any) {
      metrics.recordFailed()
      const reason = err?.message ?? String(err)
      // Only the id is logged: the token is the webhook's credential.
      console.error(`Send failed for webhook ${webhookID}: ${reason}`)
      if (DEAD_WEBHOOK_CODES.has(err?.code)) {
        blacklist.add(webhookID, webhookToken)
        console.warn(`Webhook ${webhookID} blacklisted for ${BLACKLIST_MINUTES} min`)
      }
      return c.json({ message: 'Failed to send', error: reason }, 500)
    }
  })

  return { app, cache, blacklist, metrics }
}

export type Relay = ReturnType<typeof createRelay>
