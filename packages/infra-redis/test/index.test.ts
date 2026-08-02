import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// src/index.ts constructs the ioredis client from env vars as a top-level side effect on
// import, so each scenario needs a fresh module instance (vi.resetModules() + dynamic import),
// same pattern as packages/config's tests.

describe('packages/infra-redis src/index.ts', () => {
  let originalEnv: NodeJS.ProcessEnv
  let RedisMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalEnv = { ...process.env }
    RedisMock = vi.fn().mockImplementation(function (this: any, ...args: unknown[]) {
      this.__ctorArgs = args
      this.quit = vi.fn().mockResolvedValue('OK')
    })
    vi.doMock('ioredis', () => ({ Redis: RedisMock }))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('ioredis')
  })

  it('constructs from REDIS_URL when set, ignoring host/port/db', async () => {
    process.env.REDIS_URL = '  redis://user:pass@example.com:6380/2  '
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT
    delete process.env.REDIS_DB

    vi.resetModules()
    await import('../src/index.js')

    expect(RedisMock).toHaveBeenCalledTimes(1)
    // the URL is trimmed before being passed to the Redis constructor
    expect(RedisMock).toHaveBeenCalledWith('redis://user:pass@example.com:6380/2')
  })

  it('constructs from host/port/db when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL
    process.env.REDIS_HOST = 'redis.internal'
    process.env.REDIS_PORT = '6390'
    process.env.REDIS_DB = '3'

    vi.resetModules()
    await import('../src/index.js')

    expect(RedisMock).toHaveBeenCalledWith({ host: 'redis.internal', port: 6390, db: 3 })
  })

  it('defaults host to 127.0.0.1 and port/db to 6379/0 when nothing is set', async () => {
    delete process.env.REDIS_URL
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT
    delete process.env.REDIS_DB

    vi.resetModules()
    await import('../src/index.js')

    expect(RedisMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 6379, db: 0 })
  })

  it('falls back to port 6379 and db 0 when REDIS_PORT/REDIS_DB are not valid numbers', async () => {
    delete process.env.REDIS_URL
    process.env.REDIS_PORT = 'not-a-number'
    process.env.REDIS_DB = 'also-not-a-number'

    vi.resetModules()
    await import('../src/index.js')

    expect(RedisMock).toHaveBeenCalledWith(expect.objectContaining({ port: 6379, db: 0 }))
  })

  it('gracefulShutdownRedis() calls quit() on the client', async () => {
    delete process.env.REDIS_URL

    vi.resetModules()
    const mod = await import('../src/index.js')

    await mod.gracefulShutdownRedis()

    expect((mod.default as any).quit).toHaveBeenCalledTimes(1)
  })
})
