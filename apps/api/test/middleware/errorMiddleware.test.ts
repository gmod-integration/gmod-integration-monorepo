import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('uuid', () => ({ v4: vi.fn(() => 'uuid-1') }))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const isBullMQReplyTimeoutErrorMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  isBullMQReplyTimeoutError: isBullMQReplyTimeoutErrorMock,
}))

const { default: errorMiddleware } = await import('../../src/middleware/errorMiddleware.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('errorMiddleware', () => {
  beforeEach(() => {
    gmLogMock.mockClear()
    isBullMQReplyTimeoutErrorMock.mockReset()
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
