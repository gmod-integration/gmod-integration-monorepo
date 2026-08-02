import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('packages/infra-mongo src/index.ts', () => {
  let originalEnv: NodeJS.ProcessEnv
  let MongoClientMock: ReturnType<typeof vi.fn>
  let connectMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalEnv = { ...process.env }
    connectMock = vi.fn().mockResolvedValue(undefined)
    MongoClientMock = vi.fn().mockImplementation(function (this: any, uri: string) {
      this.__uri = uri
      this.connect = connectMock
    })
    vi.doMock('mongodb', () => ({ MongoClient: MongoClientMock }))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('mongodb')
  })

  it('uses MONGO_URI directly when set', async () => {
    process.env.MONGO_URI = 'mongodb://custom-host:27099/db'
    delete process.env.MONGO_HOST
    delete process.env.MONGO_PORT

    vi.resetModules()
    await import('../src/index.js')

    expect(MongoClientMock).toHaveBeenCalledWith('mongodb://custom-host:27099/db')
  })

  it('builds a URI from MONGO_HOST/MONGO_PORT when MONGO_URI is unset', async () => {
    delete process.env.MONGO_URI
    process.env.MONGO_HOST = 'mongo.internal'
    process.env.MONGO_PORT = '27099'

    vi.resetModules()
    await import('../src/index.js')

    expect(MongoClientMock).toHaveBeenCalledWith('mongodb://mongo.internal:27099')
  })

  it('defaults to 127.0.0.1:27017 when nothing is set', async () => {
    delete process.env.MONGO_URI
    delete process.env.MONGO_HOST
    delete process.env.MONGO_PORT

    vi.resetModules()
    await import('../src/index.js')

    expect(MongoClientMock).toHaveBeenCalledWith('mongodb://127.0.0.1:27017')
  })

  it('connectToMongoDB() connects successfully and logs', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await mod.connectToMongoDB()

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('Connected to MongoDB')
  })

  it('connectToMongoDB() logs the error and exits the process on failure', async () => {
    connectMock.mockRejectedValueOnce(new Error('connection refused'))

    vi.resetModules()
    const mod = await import('../src/index.js')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)

    await expect(mod.connectToMongoDB()).rejects.toThrow('process.exit called')

    expect(errorSpy).toHaveBeenCalledWith('MongoDB connection error:', expect.any(Error))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
