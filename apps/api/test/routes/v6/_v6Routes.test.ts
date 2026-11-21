import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../src/routes/v6/dashboardSettingsRoutes.js', () => ({ default: express.Router() }))
vi.mock('../../../src/routes/v6/statusSettingsRoutes.js', () => ({ default: express.Router() }))
vi.mock('../../../src/routes/v6/accessRoutes.js', () => ({ default: express.Router() }))

const mocks = vi.hoisted(() => ({
  findSessions: vi.fn(),
  panelUser: vi.fn(),
  authAllowed: vi.fn(),
  requestErasure: vi.fn(),
  status: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_panelToken: { findMany: mocks.findSessions } } }))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: mocks.panelUser }))
vi.mock('@gmod/domain-compliance/accountErasure.js', () => ({
  requestAccountErasure: mocks.requestErasure,
  getAccountErasureStatus: mocks.status,
}))
vi.mock('@gmod/config', () => ({ ConfigServer: { websiteUrl: 'https://dashboard.example.test/app' } }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ isBullMQReplyTimeoutError: vi.fn(() => false) }))

const { default: router } = await import('../../../src/routes/v6/_v6Routes.js')
const { default: errorMiddleware } = await import('../../../src/middleware/errorMiddleware.js')

const id = 'c6801874-4d4b-4543-884c-80f379fe7299'
const otherId = 'd6801874-4d4b-4543-884c-80f379fe7299'
const receipt = 'a'.repeat(64)
const anotherReceipt = 'b'.repeat(64)
const validBody = { confirmation: 'DELETE', idempotencyKey: id, receipt }
const snapshot = { requestId: id, status: 'pending', requestedAt: '2026-11-21T12:00:00.000Z', completedAt: null }
const endpoint = '/v6/account/erasure-requests'
const sessionToken = 'actual-session-token'

function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6', router)
  instance.use(errorMiddleware)
  return instance
}
const post = (body: unknown = validBody) =>
  request(app()).post(endpoint).set('Authorization', `Bearer ${sessionToken}`).send(body)
const get = (requestId = id, value = receipt) =>
  request(app()).get(`${endpoint}/${requestId}`).set('Authorization', `Bearer ${value}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findSessions.mockResolvedValue([{ discordID: 'session-owner' }])
  mocks.panelUser.mockResolvedValue({ discordID: 'session-owner', authAllowed: mocks.authAllowed })
  mocks.authAllowed.mockResolvedValue(true)
  mocks.requestErasure.mockResolvedValue({ ...snapshot, receipt })
  mocks.status.mockImplementation(async (requestId, suppliedReceipt) =>
    requestId === id && suppliedReceipt === receipt ? snapshot : null,
  )
})
afterEach(() => vi.restoreAllMocks())

function assertError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.body).toEqual({ error: { code, message: expect.any(String) } })
  expect(JSON.stringify(response.body)).not.toContain(sessionToken)
  expect(JSON.stringify(response.body)).not.toContain(receipt)
}

describe('v6 erasure routes with real Express authentication flow', () => {
  it('uses the unique database session owner, never a client target account, and acknowledges a pending job', async () => {
    const response = await post()
    expect(response.status).toBe(202)
    expect(response.body).toEqual({ ...snapshot, receipt })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.findSessions).toHaveBeenCalledWith({
      where: { accessToken: sessionToken, revoke: false, expirationDate: { gt: expect.any(Date) } },
      select: { discordID: true },
      take: 2,
    })
    expect(mocks.panelUser).toHaveBeenCalledWith('session-owner')
    expect(mocks.authAllowed).toHaveBeenCalledWith(sessionToken)
    expect(mocks.requestErasure).toHaveBeenCalledWith('session-owner', id, receipt)
  })

  it.each([undefined, '', 'Basic session', 'Bearer', 'Bearer first second'])(
    'rejects a missing or malformed session header: %s',
    async (authorization) => {
      const operation = request(app()).post(endpoint).send(validBody)
      if (authorization) operation.set('Authorization', authorization)
      assertError(await operation, 401, 'unauthorized')
      expect(mocks.findSessions).not.toHaveBeenCalled()
      expect(mocks.requestErasure).not.toHaveBeenCalled()
    },
  )

  it.each([{ sessions: [] }, { sessions: [{ discordID: 'one' }, { discordID: 'two' }] }])(
    'rejects revoked, expired, absent or ambiguous database session matches',
    async ({ sessions }) => {
      mocks.findSessions.mockResolvedValue(sessions)
      assertError(await post(), 401, 'unauthorized')
      expect(mocks.requestErasure).not.toHaveBeenCalled()
    },
  )

  it('rejects an identity whose current session validation fails instead of returning a false success', async () => {
    mocks.authAllowed.mockResolvedValue(false)
    assertError(await post(), 401, 'unauthorized')
    expect(mocks.requestErasure).not.toHaveBeenCalled()
  })

  it('rejects an identity that no longer has a panel account', async () => {
    mocks.panelUser.mockResolvedValue(null)
    assertError(await post(), 401, 'unauthorized')
    expect(mocks.requestErasure).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { ...validBody, confirmation: 'delete' },
    { ...validBody, idempotencyKey: 'invalid-key' },
    { ...validBody, receipt: 'short' },
    { ...validBody, discordID: 'another-user' },
    { ...validBody, status: 'completed' },
  ])('rejects invalid or client-selected identity payloads', async (body) => {
    assertError(await post(body), 400, 'invalid_request')
    expect(mocks.requestErasure).not.toHaveBeenCalled()
  })

  it('refuses a query-selected account even when its body and session are valid', async () => {
    const response = await request(app())
      .post(`${endpoint}?discordID=another-user`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(validBody)
    assertError(response, 400, 'invalid_request')
    expect(mocks.requestErasure).not.toHaveBeenCalled()
  })

  it.each([
    'https://dashboard.example.test.evil.test',
    'https://other.example.test',
    'null',
    'https://dashboard.example.test/path',
  ])('refuses an unexpected Origin %s', async (origin) => {
    const response = await request(app())
      .post(endpoint)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(validBody)
    assertError(response, 403, 'origin_forbidden')
    expect(mocks.requestErasure).not.toHaveBeenCalled()
  })

  it('accepts the configured website origin and supports a receipt after the original session is revoked', async () => {
    const response = await request(app())
      .post(endpoint)
      .set('Origin', 'https://dashboard.example.test')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(validBody)
    expect(response.status).toBe(202)
    mocks.findSessions.mockResolvedValue([])
    assertError(await post(), 401, 'unauthorized')
    const followup = await get()
    expect(followup.status).toBe(200)
    expect(followup.body).toEqual(snapshot)
    expect(mocks.status).toHaveBeenCalledWith(id, receipt)
  })

  it('returns the same durable request on repeated idempotency keys and sanitizes service conflicts', async () => {
    expect((await post()).body).toEqual((await post()).body)
    mocks.requestErasure.mockRejectedValue({ code: 'account_erasure_conflict', message: `private ${receipt}` })
    assertError(await post(), 409, 'account_erasure_conflict')
  })

  it.each(['failed', 'queued', 'unknown'])('does not acknowledge an invalid service status %s', async (status) => {
    mocks.requestErasure.mockResolvedValue({ ...snapshot, status, receipt })
    assertError(await post(), 500, 'internal_error')
    mocks.status.mockResolvedValue({ ...snapshot, status })
    assertError(await get(), 500, 'internal_error')
  })

  it('strips account identifiers, credentials and internal fields from status responses', async () => {
    mocks.status.mockResolvedValue({ ...snapshot, receipt, discordID: 'private-owner', accessToken: sessionToken })
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.body).toEqual(snapshot)
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('does not give another receipt or another request access to this request', async () => {
    assertError(await get(id, anotherReceipt), 404, 'not_found')
    assertError(await get(otherId), 404, 'not_found')
  })

  it('never accepts a receipt from the query string', async () => {
    const noAuthorization = await request(app()).get(`${endpoint}/${id}?receipt=${receipt}`)
    assertError(noAuthorization, 401, 'unauthorized')
    const withAuthorization = await request(app())
      .get(`${endpoint}/${id}?receipt=${receipt}`)
      .set('Authorization', `Bearer ${receipt}`)
    assertError(withAuthorization, 400, 'invalid_request')
    expect(mocks.status).not.toHaveBeenCalled()
  })

  it('validates the status request identifier and the receipt format', async () => {
    assertError(await get('bad-id'), 400, 'invalid_request')
    assertError(await get(id, 'bad-receipt'), 401, 'unauthorized')
    expect(mocks.status).not.toHaveBeenCalled()
  })

  it('rejects a mismatched status request ID from the service', async () => {
    mocks.status.mockResolvedValue({ ...snapshot, requestId: otherId })
    assertError(await get(), 500, 'internal_error')
  })

  it('never logs raw operational errors containing secrets or reports success after a database failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.findSessions.mockRejectedValue(new Error(`${sessionToken} ${receipt}`))
    assertError(await post(), 503, 'service_unavailable')
    expect(mocks.requestErasure).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    mocks.status.mockRejectedValue(new Error(receipt))
    assertError(await get(), 503, 'service_unavailable')
    expect(log).not.toHaveBeenCalled()
  })

  it('returns a versioned safe error for malformed JSON before the router is entered', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await request(app())
      .post(endpoint)
      .set('Content-Type', 'application/json')
      .send(`{"receipt":"${receipt}"`)
    assertError(response, 400, 'invalid_request')
    expect(log).not.toHaveBeenCalled()
  })

  it('has its own version response and does not alias v3 paths', async () => {
    const response = await request(app()).get('/v6/')
    expect(response.body).toEqual({ status: 'ok', version: 'v6' })
    assertError(await request(app()).get('/v6/users/someone'), 404, 'not_found')
  })
})
