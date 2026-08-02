import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const verifyWebhookSignatureMock = vi.fn()
vi.mock('@gmod/core/models/webhooks/gmodStoreModels.js', () => ({
  verifyWebhookSignature: verifyWebhookSignatureMock,
}))

const { default: gmodStoreValidator } = await import('../../../src/middleware/webhooks/gmodStoreValidator.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

describe('gmodStoreValidator', () => {
  beforeEach(() => {
    gmLogMock.mockClear()
    verifyWebhookSignatureMock.mockReset()
  })

  it('responds 401 when the signature is invalid', async () => {
    verifyWebhookSignatureMock.mockResolvedValueOnce(false)
    const res = makeRes()
    const next = vi.fn()

    await gmodStoreValidator({ headers: {}, body: {} } as any, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.send).toHaveBeenCalledWith('unauthorized')
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when the signature is valid', async () => {
    verifyWebhookSignatureMock.mockResolvedValueOnce(true)
    const next = vi.fn()

    await gmodStoreValidator({ headers: {}, body: {} } as any, makeRes(), next)

    expect(next).toHaveBeenCalledWith()
  })

  it('forwards an error to next', async () => {
    const error = new Error('boom')
    verifyWebhookSignatureMock.mockRejectedValueOnce(error)
    const next = vi.fn()

    await gmodStoreValidator({ headers: {}, body: {} } as any, makeRes(), next)

    expect(next).toHaveBeenCalledWith(error)
  })
})
