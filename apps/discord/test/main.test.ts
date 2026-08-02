import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/core/utils/update-log.js', () => ({}))
vi.mock('@gmod/infra-bullmq', () => ({}))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const gracefulShutdownMongoMock = vi.fn()
vi.mock('@gmod/core/database/gm_server_logs.js', () => ({ gracefulShutdownMongo: gracefulShutdownMongoMock }))

const connectPrismaMock = vi.fn()
const gracefulShutdownPrismaMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({
  connectPrisma: connectPrismaMock,
  gracefulShutdownPrisma: gracefulShutdownPrismaMock,
}))

const gracefulShutdownRedisMock = vi.fn()
vi.mock('@gmod/infra-redis', () => ({ gracefulShutdownRedis: gracefulShutdownRedisMock }))

const gracefulShutdownDiscordMock = vi.fn()
const getGuildClientMock = vi.fn()
const loadDiscordMainMock = vi.fn()
const loadDiscordSlaveMock = vi.fn()
vi.mock('../src/discord/index.js', () => ({
  gracefulShutdownDiscord: gracefulShutdownDiscordMock,
  getGuildClient: getGuildClientMock,
  loadDiscordMain: loadDiscordMainMock,
  loadDiscordSlave: loadDiscordSlaveMock,
}))

const initializeDiscordQueueWorkersMock = vi.fn()
vi.mock('../src/discord/workers/discordQueueWorkers.js', () => ({
  initializeDiscordQueueWorkers: initializeDiscordQueueWorkersMock,
}))

const setDiscordGuildClientResolverMock = vi.fn()
const setDiscordStatusMessageBuilderMock = vi.fn()
vi.mock('@gmod/domain-server/discordBridge.js', () => ({
  setDiscordGuildClientResolver: setDiscordGuildClientResolverMock,
  setDiscordStatusMessageBuilder: setDiscordStatusMessageBuilderMock,
}))

const getStatusMessageMock = vi.fn()
vi.mock('../src/discord/utils/messages.js', () => ({ getStatusMessage: getStatusMessageMock }))

const { main, gracefulShutdown } = await import('../src/main.js')

function resetAllMocks() {
  gmLogMock.mockClear()
  gracefulShutdownMongoMock.mockReset().mockResolvedValue(undefined)
  connectPrismaMock.mockReset().mockResolvedValue(undefined)
  gracefulShutdownPrismaMock.mockReset().mockResolvedValue(undefined)
  gracefulShutdownRedisMock.mockReset().mockResolvedValue(undefined)
  gracefulShutdownDiscordMock.mockReset().mockResolvedValue(undefined)
  getGuildClientMock.mockReset()
  loadDiscordMainMock.mockReset().mockResolvedValue(undefined)
  loadDiscordSlaveMock.mockReset().mockResolvedValue(undefined)
  initializeDiscordQueueWorkersMock.mockReset().mockResolvedValue(undefined)
  setDiscordGuildClientResolverMock.mockReset()
  setDiscordStatusMessageBuilderMock.mockReset()
}

describe('main (apps/discord)', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('main()', () => {
    it('wires the discord bridge resolvers, connects prisma, and boots discord + workers', async () => {
      const listenersBefore = {
        SIGINT: process.listenerCount('SIGINT'),
        SIGTERM: process.listenerCount('SIGTERM'),
        unhandledRejection: process.listenerCount('unhandledRejection'),
      }

      try {
        await main()

        expect(setDiscordGuildClientResolverMock).toHaveBeenCalledWith(expect.any(Function))
        expect(setDiscordStatusMessageBuilderMock).toHaveBeenCalledWith(getStatusMessageMock)
        expect(connectPrismaMock).toHaveBeenCalled()
        expect(loadDiscordMainMock).toHaveBeenCalled()
        expect(loadDiscordSlaveMock).toHaveBeenCalled()
        expect(initializeDiscordQueueWorkersMock).toHaveBeenCalled()

        const resolver = setDiscordGuildClientResolverMock.mock.calls[0][0]
        getGuildClientMock.mockResolvedValueOnce({ id: 'client1' })
        await expect(resolver('g1', false)).resolves.toEqual({ id: 'client1' })
        expect(getGuildClientMock).toHaveBeenCalledWith('g1', false)
      } finally {
        for (const [event, before] of Object.entries(listenersBefore)) {
          const listeners = process.listeners(event as any)
          for (let i = before; i < listeners.length; i++) {
            process.removeListener(event as any, listeners[i] as any)
          }
        }
      }
    })

    it('logs unhandled rejections registered by main()', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await main()
      try {
        const handlers = process.listeners('unhandledRejection')
        const handler = handlers[handlers.length - 1] as (error: Error) => void
        handler(new Error('async boom'))
        expect(gmLogMock).toHaveBeenCalledWith('unhandledRejection', 'async boom', true)
        expect(errorSpy).toHaveBeenCalled()
      } finally {
        process.removeListener('unhandledRejection', process.listeners('unhandledRejection').pop() as any)
        process.removeListener('SIGINT', process.listeners('SIGINT').pop() as any)
        process.removeListener('SIGTERM', process.listeners('SIGTERM').pop() as any)
      }
    })
  })

  describe('gracefulShutdown()', () => {
    // `inShutdown` is private module-level state with no reset hook, so both the "tears down"
    // and "no-op on re-entry" behaviors have to be verified within a single test (across two
    // tests, the second test's first call would already be a no-op from the first test's state).
    it('tears down discord/redis/prisma/mongo and exits, then is a no-op on re-entry', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
      try {
        await gracefulShutdown()
        expect(gracefulShutdownDiscordMock).toHaveBeenCalled()
        expect(gracefulShutdownRedisMock).toHaveBeenCalled()
        expect(gracefulShutdownPrismaMock).toHaveBeenCalled()
        expect(gracefulShutdownMongoMock).toHaveBeenCalled()
        expect(exitSpy).toHaveBeenCalledWith(0)

        gracefulShutdownDiscordMock.mockClear()
        await gracefulShutdown()
        expect(gracefulShutdownDiscordMock).not.toHaveBeenCalled()
      } finally {
        exitSpy.mockRestore()
      }
    })
  })
})
