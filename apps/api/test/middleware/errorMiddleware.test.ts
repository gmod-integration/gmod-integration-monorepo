import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NodeCrypto from 'node:crypto'

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeCrypto>()),
  randomUUID: vi.fn(() => 'uuid-1'),
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: gmLogMock }))
vi.mock('@gmod/infra-redis', () => ({ default: {} }))
vi.mock('@gmod/infra-prisma', () => ({ default: {} }))

const isBullMQReplyTimeoutErrorMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  isBullMQReplyTimeoutError: isBullMQReplyTimeoutErrorMock,
}))

const { AccessDeniedError } = await import('@gmod/domain-access/index.js')
const { AuthSessionError } = await import('@gmod/domain-auth/authSessions.js')
const { DiscordOAuthError } = await import('@gmod/domain-auth/discordOAuth.js')
const { default: errorMiddleware } = await import('../../src/middleware/errorMiddleware.js')

function makeRes() {
  const res: any = {}
  res.setHeader = vi.fn()
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('errorMiddleware', () => {
  beforeEach(() => {
    gmLogMock.mockClear()
    isBullMQReplyTimeoutErrorMock.mockReset()
  })

  it.each(['/v3/users/u/guilds/g', '/v6/auth/session'])(
    'keeps transient Discord outages separate from invalid sessions for %s',
    async (path) => {
      const res = makeRes()
      await errorMiddleware(new DiscordOAuthError('provider_unavailable', 42), { path } as any, res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42')
      expect(res.json).toHaveBeenCalledWith({
        error: path.startsWith('/v6')
          ? expect.objectContaining({ code: 'provider_unavailable' })
          : 'provider_unavailable',
      })
      expect(gmLogMock).not.toHaveBeenCalled()
    },
  )

  it('requests Discord reauthorization without falsely invalidating the application session', async () => {
    const res = makeRes()
    await errorMiddleware(new DiscordOAuthError('grant_rejected'), { path: '/v6/guilds/g/access' } as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: 'discord_reauth_required' }) })
  })

  it('returns a real application-session expiration as an authentication error', async () => {
    const res = makeRes()
    await errorMiddleware(
      new AuthSessionError(401, 'unauthorized', 'Sign in again.'),
      { path: '/v6/auth/session' } as any,
      res,
      vi.fn(),
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'unauthorized', message: 'Sign in again.' } })
  })

  it('returns a cookie CSRF failure separately from a logout or provider outage', async () => {
    const res = makeRes()
    await errorMiddleware(
      new AuthSessionError(403, 'csrf_invalid', 'Reload the session.'),
      { path: '/v6/auth/logout' } as any,
      res,
      vi.fn(),
    )
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'csrf_invalid', message: 'Reload the session.' } })
  })

  it('maps compatible provider errors without an explicit status to 503', async () => {
    const res = makeRes()
    await errorMiddleware(
      Object.assign(new Error('Temporarily unavailable.'), { code: 'provider_unavailable' }),
      {} as any,
      res,
      vi.fn(),
    )
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'provider_unavailable' })
  })

  it.each(['/v3/users/u', '/v6/auth/session'])(
    'returns account erasure protection without logging private details for %s',
    async (path) => {
      const res = makeRes()
      await errorMiddleware(
        Object.assign(new Error('Internal subject and storage details'), { code: 'personal_data_erasure_blocked' }),
        { path } as any,
        res,
        vi.fn(),
      )
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(res.json).toHaveBeenCalledWith({
        error: path.startsWith('/v6')
          ? { code: 'personal_data_erasure_blocked', message: 'Account erasure is in progress.' }
          : 'personal_data_erasure_blocked',
      })
      expect(gmLogMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['/v6', 'entity.parse.failed', 'body with private receipt', 400, 'invalid_request'],
    ['/v6/auth/session', 'entity.too.large', 'body with private receipt', 413, 'invalid_request'],
    ['/v6/auth/session', undefined, 'Not allowed by CORS', 403, 'origin_forbidden'],
    ['/v6/auth/session', 'other', 'private internal provider response', 503, 'service_unavailable'],
  ])('uses the v6 safe error contract for %s (%s)', async (path, type, message, status, code) => {
    const res = makeRes()
    const error = type ? Object.assign(new Error(message), { type }) : new Error(message)
    await errorMiddleware(error, { path } as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.json).toHaveBeenCalledWith({ error: { code, message: expect.any(String) } })
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(message)
    expect(gmLogMock).not.toHaveBeenCalled()
  })

  it.each(['/v3/users/u/guilds/g', '/v6/guilds/g/access'])(
    'returns a safe access error with the same business code for %s',
    async (path) => {
      const res = makeRes()
      await errorMiddleware(new AccessDeniedError('guild.links', 'quota_reached', 2, 2), { path } as any, res, vi.fn())
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(res.json).toHaveBeenCalledWith(
        path.startsWith('/v6')
          ? {
              error: {
                code: 'quota_reached',
                message: expect.any(String),
                capability: 'guild.links',
                limit: 2,
                used: 2,
              },
            }
          : { error: 'quota_reached', capability: 'guild.links', limit: 2, used: 2 },
      )
      expect(gmLogMock).not.toHaveBeenCalled()
    },
  )

  it('reports unavailable entitlement verification separately from upgrade requirements', async () => {
    const res = makeRes()
    await errorMiddleware(
      new AccessDeniedError('status.chart', 'entitlement_unknown'),
      { path: '/v6/guilds/g/access' } as any,
      res,
      vi.fn(),
    )
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: 'entitlement_unknown' }) })
  })

  it('responds 503 for a BullMQ reply timeout error', async () => {
    isBullMQReplyTimeoutErrorMock.mockReturnValueOnce(true)
    const res = makeRes()

    await errorMiddleware(new Error('discord timeout'), {} as any, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'discord_service_unavailable' })
  })

  it('responds 500 with a logged error UUID for any other error', async () => {
    isBullMQReplyTimeoutErrorMock.mockReturnValueOnce(false)
    const res = makeRes()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await errorMiddleware(new Error('boom'), {} as any, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'internal_server_error', error_uuid: 'uuid-1' })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
