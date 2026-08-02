import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('packages/infra-bullmq src/index.ts (connection config)', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('prefers BULLMQ_HOST/BULLMQ_PORT over REDIS_* and defaults', async () => {
    process.env.BULLMQ_HOST = 'bullmq.internal'
    process.env.BULLMQ_PORT = '6400'
    process.env.REDIS_HOST = 'redis.internal'
    process.env.REDIS_PORT = '6390'

    vi.resetModules()
    const { connection } = await import('../src/index.js')

    expect(connection).toEqual({ host: 'bullmq.internal', port: 6400 })
  })

  it('falls back to REDIS_HOST/REDIS_PORT when BULLMQ_* is unset', async () => {
    delete process.env.BULLMQ_HOST
    delete process.env.BULLMQ_PORT
    process.env.REDIS_HOST = 'redis.internal'
    process.env.REDIS_PORT = '6390'

    vi.resetModules()
    const { connection } = await import('../src/index.js')

    expect(connection).toEqual({ host: 'redis.internal', port: 6390 })
  })

  it('defaults to 127.0.0.1:6379 when nothing is set', async () => {
    delete process.env.BULLMQ_HOST
    delete process.env.BULLMQ_PORT
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT

    vi.resetModules()
    const { connection } = await import('../src/index.js')

    expect(connection).toEqual({ host: '127.0.0.1', port: 6379 })
  })

  it('falls back to port 6379 when the resolved port is not a valid number', async () => {
    delete process.env.BULLMQ_PORT
    process.env.REDIS_PORT = 'not-a-number'

    vi.resetModules()
    const { connection } = await import('../src/index.js')

    expect(connection.port).toBe(6379)
  })
})
