import { createHash } from 'node:crypto'
import { AttachmentBuilder } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetrics } from '../src/metrics.js'
import { createRelay, isAuthorized } from '../src/relay.js'
import { WebhookBlacklist } from '../src/webhooks.js'

const TOKEN = 'relay-test-token'
const WEBHOOK_ID = '123456789012345678'
const WEBHOOK_TOKEN = 'abc-DEF_123'

function setup(send = vi.fn().mockResolvedValue({ id: 'message-id', content: 'hi' })) {
  const destroy = vi.fn()
  const createSender = vi.fn(() => ({ send, destroy }))
  const relay = createRelay({ barerToken: TOKEN, createSender })
  return { relay, send, createSender }
}

function post(relay: ReturnType<typeof createRelay>, body: unknown, authorization: string | null = `Bearer ${TOKEN}`) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authorization !== null) headers.Authorization = authorization
  return relay.app.request('/', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const validBody = (data: Record<string, unknown> = { content: 'hello' }) => ({
  webhookID: WEBHOOK_ID,
  webhookToken: WEBHOOK_TOKEN,
  data,
})

describe('isAuthorized', () => {
  const digest = createHash('sha256').update(TOKEN).digest()

  it('accepts `<scheme> <token>` with the right token only', () => {
    expect(isAuthorized(`Bearer ${TOKEN}`, digest)).toBe(true)
    expect(isAuthorized(`Bearer ${TOKEN}x`, digest)).toBe(false)
    expect(isAuthorized('Bearer', digest)).toBe(false)
    expect(isAuthorized(undefined, digest)).toBe(false)
  })
})

describe('webhook relay HTTP app', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers the uptime check on GET /', async () => {
    const res = await setup().relay.app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello World')
  })

  it('exposes Prometheus metrics on GET /metrics', async () => {
    const res = await setup().relay.app.request('/metrics')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('relay_messages_total')
  })

  it.each([
    ['no Authorization header', null],
    ['a wrong token', 'Bearer nope'],
    ['a scheme without a token', 'Bearer'],
  ])('rejects a request with %s', async (_label, authorization) => {
    const { relay, send } = setup()
    const res = await post(relay, validBody(), authorization)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ message: 'Unauthorized' })
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    const { relay, send } = setup()
    const res = await post(relay, '{not json')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'Invalid JSON body' })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty webhook id (unconfigured channel)', { webhookID: '', webhookToken: WEBHOOK_TOKEN, data: {} }],
    ['no token', { webhookID: WEBHOOK_ID, data: {} }],
    ['no data', { webhookID: WEBHOOK_ID, webhookToken: WEBHOOK_TOKEN }],
    ['a JSON null body', null],
  ])('rejects a request with %s as missing parameters', async (_label, body) => {
    const { relay, send } = setup()
    const res = await post(relay, body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'Missing parameters' })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-numeric webhook id', { ...validBody(), webhookID: '../../users/@me' }],
    ['a token with path characters', { ...validBody(), webhookToken: 'abc/../x' }],
    ['malformed filesToAdd', validBody({ filesToAdd: 'nope' })],
  ])('rejects %s', async (_label, body) => {
    const { relay, send } = setup()
    const res = await post(relay, body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'Invalid parameters' })
    expect(send).not.toHaveBeenCalled()
  })

  it('relays the message to the webhook and returns what Discord sent back', async () => {
    const { relay, send, createSender } = setup()
    const data = { username: 'Player', avatarURL: 'https://example.com/a.png', content: 'hello', embeds: [] }
    const res = await post(relay, validBody(data))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'message-id', content: 'hi' })
    expect(createSender).toHaveBeenCalledWith(WEBHOOK_ID, WEBHOOK_TOKEN)
    expect(send).toHaveBeenCalledWith(data)
    expect(await relay.metrics.registry.getSingleMetric('relay_messages_total')!.get()).toMatchObject({
      values: [{ value: 1 }],
    })
  })

  it('reuses one webhook client across requests', async () => {
    const { relay, createSender } = setup()
    await post(relay, validBody())
    await post(relay, validBody())
    expect(createSender).toHaveBeenCalledOnce()
  })

  it('turns filesToAdd into inline attachments', async () => {
    const { relay, send } = setup()
    const res = await post(relay, validBody({ embeds: [], filesToAdd: [{ name: 'log.json', content: '{"a":1}' }] }))

    expect(res.status).toBe(200)
    const options = send.mock.calls[0]![0]
    expect(options).not.toHaveProperty('filesToAdd')
    expect(options.files).toHaveLength(1)
    expect(options.files[0]).toBeInstanceOf(AttachmentBuilder)
    expect(options.files[0].name).toBe('log.json')
    expect(options.files[0].attachment.toString('utf-8')).toBe('{"a":1}')
  })

  it.each([
    ['without filesToAdd', validBody({ content: 'x', files: ['/etc/passwd'] })],
    ['with filesToAdd', validBody({ files: ['/etc/passwd'], filesToAdd: [] })],
  ])('never forwards a caller-supplied `files` (%s)', async (_label, body) => {
    const { relay, send } = setup()
    await post(relay, body)
    const options = send.mock.calls[0]![0]
    expect(options.files ?? []).toEqual([])
  })

  it('returns 500 when Discord rejects the message, without blacklisting the webhook', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('Missing Access')).mockResolvedValueOnce({ id: 'ok' })
    const { relay } = setup(send)

    const res = await post(relay, validBody())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ message: 'Failed to send', error: 'Missing Access' })
    expect(console.error).toHaveBeenCalledWith(`Send failed for webhook ${WEBHOOK_ID}: Missing Access`)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(WEBHOOK_TOKEN)

    expect((await post(relay, validBody())).status).toBe(200)
  })

  it('reports a non-Error rejection as text', async () => {
    const { relay } = setup(vi.fn().mockRejectedValue('socket hang up'))
    const res = await post(relay, validBody())
    expect(await res.json()).toEqual({ message: 'Failed to send', error: 'socket hang up' })
  })

  it.each([
    ['Unknown Webhook', 10015],
    ['Invalid Webhook Token', 50027],
  ])('blacklists the webhook after "%s" and skips it on the next request', async (message, code) => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error(message), { code }))
    const { relay } = setup(send)

    expect((await post(relay, validBody())).status).toBe(500)
    const res = await post(relay, validBody())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'Webhook temporarily disabled after previous failure' })
    expect(send).toHaveBeenCalledOnce()
    expect(console.warn).toHaveBeenCalledWith(`Webhook ${WEBHOOK_ID} blacklisted for 10 min`)
  })

  it('counts every rejected or failed request as failed', async () => {
    const { relay } = setup(vi.fn().mockRejectedValue(new Error('boom')))
    await post(relay, '{bad')
    await post(relay, {})
    await post(relay, { ...validBody(), webhookID: 'x' })
    await post(relay, validBody())
    expect(await relay.metrics.registry.getSingleMetric('relay_messages_failed_total')!.get()).toMatchObject({
      values: [{ value: 4 }],
    })
  })

  it('uses the metrics and blacklist it is given', async () => {
    const metrics = createMetrics()
    const blacklist = new WebhookBlacklist()
    blacklist.add(WEBHOOK_ID, WEBHOOK_TOKEN)
    const relay = createRelay({ barerToken: TOKEN, createSender: vi.fn(), metrics, blacklist })

    expect((await post(relay, validBody())).status).toBe(400)
    expect(relay.metrics).toBe(metrics)
    expect(relay.blacklist).toBe(blacklist)
  })
})
