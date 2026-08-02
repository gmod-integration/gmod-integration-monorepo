import { beforeEach, describe, expect, it, vi } from 'vitest'

const addMock = vi.fn()
const onMock = vi.fn()

vi.mock('bullmq', () => {
  class QueueMock {
    name: string
    add = addMock
    constructor(name: string) {
      this.name = name
    }
  }
  class QueueEventsMock {
    on = onMock
    constructor(_name: string) {}
  }
  return { Queue: QueueMock, QueueEvents: QueueEventsMock }
})

vi.mock('@gmod/infra-bullmq', () => ({ connection: { host: '127.0.0.1', port: 6379 } }))

describe('packages/infra-websocket src/queues.ts', () => {
  beforeEach(() => {
    addMock.mockReset()
    onMock.mockReset()
    vi.resetModules()
  })

  it('constructs both queues with the shared connection', async () => {
    const mod = await import('../src/queues.js')

    expect(mod.wsSendToServerQueue.name).toBe('wsSendToServer')
    expect(mod.wsSendToAllClientsOfServerQueue.name).toBe('wsSendToAllClientsOfServer')
  })

  it('registers an error handler on the QueueEvents instance', async () => {
    await import('../src/queues.js')

    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function))
    const errorHandler = onMock.mock.calls[0][1]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    errorHandler(new Error('boom'))
    expect(errorSpy).toHaveBeenCalledWith('[infra-websocket] wsSendToServerQueueEvents error:', expect.any(Error))
  })

  it('enqueueWSSendToServerAndWait adds a job and returns true when it resolves truthy', async () => {
    const job = { waitUntilFinished: vi.fn().mockResolvedValue(true) }
    addMock.mockResolvedValue(job)

    const mod = await import('../src/queues.js')
    const result = await mod.enqueueWSSendToServerAndWait({ id: 'server-1', data: { hello: 'world' } })

    expect(addMock).toHaveBeenCalledWith(
      'wsSendToServer',
      { id: 'server-1', data: { hello: 'world' } },
      { removeOnComplete: true, removeOnFail: true },
    )
    expect(job.waitUntilFinished).toHaveBeenCalledWith(expect.anything(), 5000)
    expect(result).toBe(true)
  })

  it('enqueueWSSendToServerAndWait returns false when the job resolves falsy', async () => {
    const job = { waitUntilFinished: vi.fn().mockResolvedValue(undefined) }
    addMock.mockResolvedValue(job)

    const mod = await import('../src/queues.js')
    const result = await mod.enqueueWSSendToServerAndWait({ id: 'server-1', data: {} }, 1234)

    expect(job.waitUntilFinished).toHaveBeenCalledWith(expect.anything(), 1234)
    expect(result).toBe(false)
  })
})
