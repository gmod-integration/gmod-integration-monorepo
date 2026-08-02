import { describe, expect, it, vi } from 'vitest'

const processGmodStoreWebhookMock = vi.fn()
vi.mock('@gmod/core/models/webhooks/gmodStoreModels.js', () => ({
  processGmodStoreWebhook: processGmodStoreWebhookMock,
}))

const { default: gmodstoreController } = await import('../../../src/controllers/webhooks/gmodstoreControllers.js')

describe('gmodstoreController', () => {
  it('forwards the request body and responds with the processed status/body', async () => {
    processGmodStoreWebhookMock.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await gmodstoreController({ body: { eventType: 'x' } } as any, { status } as any)

    expect(processGmodStoreWebhookMock).toHaveBeenCalledWith({ eventType: 'x' })
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({ success: true })
  })
})
