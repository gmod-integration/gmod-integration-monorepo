import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

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

  it('prefers the cf-connecting-ip header over req.ip', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ headers: { 'cf-connecting-ip': '9.9.9.9' } }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalledWith('api', expect.stringContaining('IP: 9.9.9.9'))
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

  it('does not redact when the bugs body has no screenshot', () => {
    const next = vi.fn()
    loggerMiddleware(makeReq({ url: '/v3/servers/s1/players/765/bugs', body: {} }), {} as any, next)
    expect(gmLogMock).toHaveBeenCalled()
  })

  it('does not redact when the bugs body screenshot has no nested screenshot field', () => {
    const next = vi.fn()
    loggerMiddleware(
      makeReq({ url: '/v3/servers/s1/players/765/bugs', body: { screenshot: {} } }),
      {} as any,
      next,
    )
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
