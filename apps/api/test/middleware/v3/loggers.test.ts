import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const gmLogMock = vi.fn()
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: gmLogMock }))

const { default: loggerMiddleware } = await import('../../../src/middleware/v3/loggers.js')

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: 'GET',
    url: '/v3/servers/s1/players',
    headers: {},
    ip: '1.2.3.4',
    query: {},
    body: {},
    ...overrides,
  } as any
}

describe('loggerMiddleware', () => {
  beforeEach(() => {
    gmLogMock.mockClear()
  })

  it('logs the request and calls next', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq(), {} as any, next)
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.stringContaining('Method: GET'))
    expect(next).toHaveBeenCalled()
  })

  it('records the actor and subject resolved after middleware for delegated actions without secrets', () => {
    const req = makeReq({ method: 'PUT', url: '/v6/guilds/123/settings?token=private', body: { token: 'private' } })
    const res = Object.assign(new EventEmitter(), { statusCode: 200 })
    loggerMiddleware(req, res as any, vi.fn())
    req.authSession = { id: 'delegated-session', discordID: 'target', actorDiscordID: 'operator', tokenHash: 'private' }
    res.emit('finish')
    expect(gmLogMock).toHaveBeenLastCalledWith(
      'auth',
      JSON.stringify({
        action: 'delegated_request',
        actor: 'operator',
        subject: 'target',
        sessionID: 'delegated-session',
        method: 'PUT',
        path: '/v6/guilds/123/settings',
        status: 200,
      }),
    )
    expect(gmLogMock.mock.calls.at(-1)?.[1]).not.toContain('private')
  })

  it('uses the resolved peer IP instead of trusting arbitrary Cloudflare headers', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ headers: { 'cf-connecting-ip': '9.9.9.9' } }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.stringContaining('IP: 1.2.3.4'))
  })

  it('redacts the bug-report screenshot payload', () => {
    const next = vi.fn()
    loggerMiddleware(
      makeReq({
        url: '/v3/servers/s1/players/765/bugs',
        body: { screenshot: { screenshot: 'base64data' } },
      }),
      {} as any,
      next,
    )
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.stringContaining('[IMAGE]'))
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.not.stringContaining('base64data'))
  })

  it('redacts the screenshots payload', () => {
    const next = vi.fn()
    loggerMiddleware(
      makeReq({
        url: '/v3/servers/s1/screenshots',
        body: { screenshot: 'base64data' },
      }),
      {} as any,
      next,
    )
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.stringContaining('[IMAGE]'))
  })

  it('keeps bot credentials and authorization codes out of all log fields without mutating the request', () => {
    const body = {
      username: 'Custom bot',
      token: 'private-bot-token',
      nested: [{ api_key: 'private-api-key', refreshToken: 'private-refresh-token', status: 'online' }],
    }
    const req = makeReq({
      url: '/v3/users/login?code=private-oauth-code',
      query: { code: 'private-oauth-code', redirect: '/account' },
      body,
    })
    loggerMiddleware(req, {} as any, vi.fn())

    const message = gmLogMock.mock.calls[0][1] as string
    expect(message).not.toContain('private-')
    expect(message).toContain('[REDACTED]')
    expect(message).toContain('Custom bot')
    expect(message).toContain('/account')
    expect(body.token).toBe('private-bot-token')
    expect(body.nested[0].refreshToken).toBe('private-refresh-token')
    expect(req.query.code).toBe('private-oauth-code')
  })

  it('redacts image bodies even when the upload URL includes query parameters', () => {
    const body = { screenshot: 'base64-secret-image' }
    loggerMiddleware(makeReq({ url: '/v3/servers/s1/screenshots?size=large', body }), {} as any, vi.fn())

    expect(gmLogMock.mock.calls[0][1]).toContain('[IMAGE]')
    expect(gmLogMock.mock.calls[0][1]).not.toContain('base64-secret-image')
    expect(body.screenshot).toBe('base64-secret-image')
  })

  it('keeps erasure receipts out of the body, query and Authorization log fields', () => {
    const receipt = 'e'.repeat(64)
    const req = makeReq({
      url: `/v6/account/erasure-requests/request-id?receipt=${receipt}`,
      headers: { authorization: `Bearer ${receipt}` },
      body: { receipt },
      query: { receipt },
    })
    loggerMiddleware(req, {} as any, vi.fn())
    const message = gmLogMock.mock.calls[0][1] as string
    expect(message).not.toContain(receipt)
    expect(message).toContain('[REDACTED]')
    expect(req.body.receipt).toBe(receipt)
  })

  it('does not redact when the bugs body has no screenshot', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ url: '/v3/servers/s1/players/765/bugs', body: {} }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalled()
  })

  it('does not redact when the bugs body screenshot has no nested screenshot field', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ url: '/v3/servers/s1/players/765/bugs', body: { screenshot: {} } }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalled()
  })

  it('does not redact when the screenshots body has no screenshot field', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ url: '/v3/servers/s1/screenshots', body: {} }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalled()
  })

  it('extracts the server ID segment from the URL', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ url: '/v3/servers/s1/players' }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.stringContaining('Server ID: servers'))
  })
})
