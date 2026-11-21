import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomUUID: vi.fn(() => 'uuid-1'),
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: gmLogMock }))

const isBullMQReplyTimeoutErrorMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  isBullMQReplyTimeoutError: isBullMQReplyTimeoutErrorMock,
}))

const { AccessDeniedError } = await import('@gmod/domain-access/index.js')
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
