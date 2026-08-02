import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/core/utils/update-log.js', () => ({}))
vi.mock('@gmod/infra-bullmq', () => ({}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  isBullMQReplyTimeoutError: vi.fn(() => false),
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

// A pass-through no-op is enough here: this file's own tests only care about its own
// middleware/CORS/shutdown-gate/error-handling wiring, not the mounted routes' behavior
// (already covered in test/routes/mainRoutes.test.ts) - and letting every request fall through
// to app's 404 handler is exactly what most of these tests want.
vi.mock('@/routes/mainRoutes.js', () => ({ default: (req: any, res: any, next: any) => next() }))

const gracefulShutdownRedisMock = vi.fn()
vi.mock('@gmod/infra-redis', () => ({ gracefulShutdownRedis: gracefulShutdownRedisMock }))

const connectPrismaMock = vi.fn()
const gracefulShutdownPrismaMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({
  connectPrisma: connectPrismaMock,
  gracefulShutdownPrisma: gracefulShutdownPrismaMock,
}))

const gracefulShutdownMongoMock = vi.fn()
vi.mock('@gmod/core/database/gm_server_logs.js', () => ({ gracefulShutdownMongo: gracefulShutdownMongoMock }))

let configServerMock: any
vi.mock('@gmod/config', () => ({
  get ConfigServer() {
    return configServerMock
  },
}))

configServerMock = {
  dev: false,
  bodyLimit: '10mb',
  domain: 'https://gmod-integration.com',
  websiteUrl: 'https://gmod-integration.com',
  ports: { api: 3001 },
}

const { app, main, gracefulShutdown } = await import('../src/gm_integration_api.js')

describe('gm_integration_api', () => {
  beforeEach(() => {
    gmLogMock.mockClear()
    gracefulShutdownRedisMock.mockReset().mockResolvedValue(undefined)
    connectPrismaMock.mockReset().mockResolvedValue(undefined)
    gracefulShutdownPrismaMock.mockReset().mockResolvedValue(undefined)
    gracefulShutdownMongoMock.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responds 404 for an unmatched route', async () => {
    const response = await request(app).get('/totally-unknown-route')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: '404 Not Found' })
  })

  describe('CORS', () => {
    it('allows a request with no Origin header', async () => {
      const response = await request(app).get('/totally-unknown-route')
      expect(response.status).not.toBe(500)
    })

    it('allows the official gmod-integration.com domain', async () => {
      const response = await request(app).get('/totally-unknown-route').set('Origin', 'https://app.gmod-integration.com')
      expect(response.headers['access-control-allow-origin']).toBe('https://app.gmod-integration.com')
    })

    it('sets Cross-Origin-Resource-Policy for *.gmod-integration.com origins', async () => {
      const response = await request(app).get('/totally-unknown-route').set('Origin', 'https://app.gmod-integration.com')
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
    })

    it('does not set Cross-Origin-Resource-Policy for other origins', async () => {
      const response = await request(app).get('/totally-unknown-route').set('Origin', 'https://gmod-integration.com')
      expect(response.headers['cross-origin-resource-policy']).toBeUndefined()
    })

    it('allows an explicitly configured origin (ConfigServer.websiteUrl/domain)', async () => {
      const response = await request(app).get('/totally-unknown-route').set('Origin', 'https://gmod-integration.com')
      expect(response.headers['access-control-allow-origin']).toBe('https://gmod-integration.com')
    })

    it('allows localhost when dev mode is on', async () => {
      configServerMock.dev = true
      try {
        const response = await request(app).get('/totally-unknown-route').set('Origin', 'http://localhost:3000')
        expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
      } finally {
        configServerMock.dev = false
      }
    })

    it('rejects localhost when dev mode is off, routing the CORS error through errorMiddleware', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const response = await request(app).get('/totally-unknown-route').set('Origin', 'http://localhost:3000')
      expect(response.status).toBe(500)
      expect(response.body.error).toBe('internal_server_error')
      errorSpy.mockRestore()
    })

    it('rejects an unrelated, unconfigured origin', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const response = await request(app).get('/totally-unknown-route').set('Origin', 'https://evil.example')
      expect(response.status).toBe(500)
      errorSpy.mockRestore()
    })
  })

  it('responds 503 while shutting down (via the shutdown gate middleware)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    try {
      await gracefulShutdown()
      const response = await request(app).get('/totally-unknown-route')
      expect(response.status).toBe(503)
      expect(response.body).toEqual({ error: 'Server is in the process of restarting' })
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('gracefulShutdown tears down redis/prisma/mongo and exits', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    try {
      await gracefulShutdown()
      expect(gracefulShutdownRedisMock).toHaveBeenCalled()
      expect(gracefulShutdownPrismaMock).toHaveBeenCalled()
      expect(gracefulShutdownMongoMock).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(0)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('main() connects prisma and starts listening', async () => {
    const listenSpy = vi.spyOn(app, 'listen').mockImplementation(((_port: any, cb?: () => void) => {
      cb?.()
      return {} as any
    }) as any)
    const sigintListenersBefore = process.listenerCount('SIGINT')
    const sigtermListenersBefore = process.listenerCount('SIGTERM')
    const unhandledListenersBefore = process.listenerCount('unhandledRejection')

    try {
      await main()
      expect(connectPrismaMock).toHaveBeenCalled()
      expect(listenSpy).toHaveBeenCalledWith(3001, expect.any(Function))
      expect(gmLogMock).toHaveBeenCalledWith('express', expect.stringContaining('Server started'))
    } finally {
      listenSpy.mockRestore()
      // main() registers real process-level listeners each call - trim back to the pre-test
      // count so repeated test runs don't accumulate them (and trip Node's max-listeners warning).
      const sigintListeners = process.listeners('SIGINT')
      for (let i = sigintListenersBefore; i < sigintListeners.length; i++) {
        process.removeListener('SIGINT', sigintListeners[i] as any)
      }
      const sigtermListeners = process.listeners('SIGTERM')
      for (let i = sigtermListenersBefore; i < sigtermListeners.length; i++) {
        process.removeListener('SIGTERM', sigtermListeners[i] as any)
      }
      const unhandledListeners = process.listeners('unhandledRejection')
      for (let i = unhandledListenersBefore; i < unhandledListeners.length; i++) {
        process.removeListener('unhandledRejection', unhandledListeners[i] as any)
      }
    }
  })

  it('logs unhandled rejections registered by main()', async () => {
    const listenSpy = vi.spyOn(app, 'listen').mockImplementation(((_port: any, cb?: () => void) => {
      cb?.()
      return {} as any
    }) as any)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await main()
      const handlers = process.listeners('unhandledRejection')
      const handler = handlers[handlers.length - 1] as (error: Error) => void
      handler(new Error('async boom'))
      expect(gmLogMock).toHaveBeenCalledWith('unhandledRejection', 'async boom', true)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      listenSpy.mockRestore()
      const handlers = process.listeners('unhandledRejection')
      process.removeListener('unhandledRejection', handlers[handlers.length - 1] as any)
      process.removeListener('SIGINT', process.listeners('SIGINT').pop() as any)
      process.removeListener('SIGTERM', process.listeners('SIGTERM').pop() as any)
    }
  })
})
