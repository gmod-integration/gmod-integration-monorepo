import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PrismaMariaDbMock = vi.fn().mockImplementation(function (this: any, options: unknown) {
  this.__options = options
})

let connectMock: ReturnType<typeof vi.fn>
let disconnectMock: ReturnType<typeof vi.fn>
const PrismaClientMock = vi.fn().mockImplementation(function (this: any) {
  this.$connect = connectMock
  this.$disconnect = disconnectMock
})

vi.mock('@prisma/adapter-mariadb', () => ({ PrismaMariaDb: PrismaMariaDbMock }))
vi.mock('../generated/prisma/client.js', () => ({ PrismaClient: PrismaClientMock }))

describe('packages/infra-prisma src/index.ts', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    connectMock = vi.fn().mockResolvedValue(undefined)
    disconnectMock = vi.fn().mockResolvedValue(undefined)
    PrismaMariaDbMock.mockClear()
    PrismaClientMock.mockClear()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('caps the connection limit at 10 in dev when MARIA_CONNECTION_LIMIT is unset (defaults to 10)', async () => {
    process.env.DEV = 'true'
    delete process.env.MARIA_CONNECTION_LIMIT

    vi.resetModules()
    await import('../src/index.js')

    expect(PrismaMariaDbMock).toHaveBeenCalledWith(expect.objectContaining({ connectionLimit: 10 }))
  })

  it('uses a lower dev MARIA_CONNECTION_LIMIT as-is when under the cap', async () => {
    process.env.DEV = 'true'
    process.env.MARIA_CONNECTION_LIMIT = '5'

    vi.resetModules()
    await import('../src/index.js')

    expect(PrismaMariaDbMock).toHaveBeenCalledWith(expect.objectContaining({ connectionLimit: 5 }))
  })

  it('caps a higher dev MARIA_CONNECTION_LIMIT down to 10', async () => {
    process.env.DEV = 'true'
    process.env.MARIA_CONNECTION_LIMIT = '20'

    vi.resetModules()
    await import('../src/index.js')

    expect(PrismaMariaDbMock).toHaveBeenCalledWith(expect.objectContaining({ connectionLimit: 10 }))
  })

  it('defaults to 50 in prod when MARIA_CONNECTION_LIMIT is unset', async () => {
    process.env.DEV = 'false'
    delete process.env.MARIA_CONNECTION_LIMIT

    vi.resetModules()
    await import('../src/index.js')

    expect(PrismaMariaDbMock).toHaveBeenCalledWith(expect.objectContaining({ connectionLimit: 50 }))
  })

  it('does not cap MARIA_CONNECTION_LIMIT in prod', async () => {
    process.env.DEV = 'false'
    process.env.MARIA_CONNECTION_LIMIT = '100'

    vi.resetModules()
    await import('../src/index.js')

    expect(PrismaMariaDbMock).toHaveBeenCalledWith(expect.objectContaining({ connectionLimit: 100 }))
  })

  it('passes MARIA_HOST/USER/PASSWORD/NAME through to the adapter', async () => {
    process.env.MARIA_HOST = 'db.internal'
    process.env.MARIA_USER = 'gmod'
    process.env.MARIA_PASSWORD = 'a-secret'
    process.env.MARIA_NAME = 'gmod_db'

    vi.resetModules()
    await import('../src/index.js')

    expect(PrismaMariaDbMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'db.internal', user: 'gmod', password: 'a-secret', database: 'gmod_db' }),
    )
  })

  it('connectPrisma() connects once and logs the connection limit', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await mod.connectPrisma()

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Prisma Client connected'))
  })

  it('connectPrisma() memoizes: a second call does not connect again', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await mod.connectPrisma()
    await mod.connectPrisma()

    expect(connectMock).toHaveBeenCalledTimes(1)
  })

  it('connectPrisma() coalesces concurrent calls into a single $connect', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await Promise.all([mod.connectPrisma(), mod.connectPrisma()])

    expect(connectMock).toHaveBeenCalledTimes(1)
  })

  it('connectPrisma() rethrows and resets state on failure, allowing a retry', async () => {
    connectMock
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined)

    vi.resetModules()
    const mod = await import('../src/index.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(mod.connectPrisma()).rejects.toThrow('connection refused')
    await mod.connectPrisma()

    expect(connectMock).toHaveBeenCalledTimes(2)
  })

  it('gracefulShutdownPrisma() disconnects and resets state so a later connectPrisma() reconnects', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await mod.connectPrisma()
    await mod.gracefulShutdownPrisma()
    await mod.connectPrisma()

    expect(disconnectMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenCalledTimes(2)
  })

  it('exports the prisma client as the default export', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')

    expect(mod.default).toBeDefined()
    expect(PrismaClientMock).toHaveBeenCalledTimes(1)
  })
})
