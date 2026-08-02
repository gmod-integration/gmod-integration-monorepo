import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signingSecretKey = 'whsec_' + Buffer.from('super-secret-signing-key').toString('base64')
vi.mock('@gmod/config', () => ({
  ConfigGmodStore: { signingSecretKey, apiKey: 'api-key-1' },
}))

const gmLogMock = vi.fn()
vi.mock('../../../src/utils/logger.js', () => ({ gmLog: gmLogMock }))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const addNotificationMock = vi.fn()
vi.mock('../../../src/utils/tools.js', () => ({ addNotification: addNotificationMock }))

const prismaMock: any = {
  gm_gmodstore_purchases: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  verifyWebhookSignature,
  getUser,
  saveGmodStorePurchase,
  processGmodStoreWebhook,
} = await import('../../../src/models/webhooks/gmodStoreModels.js')

function computeSignature(webhookId: string, webhookTimestamp: number, payload: any) {
  const rawSecret = signingSecretKey.replace('whsec_', '')
  return crypto
    .createHmac('sha256', Buffer.from(rawSecret, 'base64'))
    .update(`${webhookId}.${webhookTimestamp}.${JSON.stringify(payload)}`)
    .digest('base64')
}

function resetAllMocks() {
  gmLogMock.mockClear()
  getUserFromSteamID64Mock.mockReset()
  addNotificationMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  vi.stubGlobal('fetch', vi.fn())
}

describe('gmodStoreModels', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('verifyWebhookSignature', () => {
    it('returns true for a valid, recent signature', async () => {
      const payload = { a: 1 }
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = computeSignature('wh1', timestamp, payload)

      await expect(
        verifyWebhookSignature(
          { 'webhook-signature': `v1,${signature}`, 'webhook-timestamp': timestamp, 'webhook-id': 'wh1' },
          payload,
        ),
      ).resolves.toBe(true)
    })

    it('checks every space-separated signature candidate, skipping a same-length mismatch', async () => {
      const payload = { a: 1 }
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = computeSignature('wh1', timestamp, payload)
      const wrongButSameLength = computeSignature('wh1', timestamp, { a: 2 })

      await expect(
        verifyWebhookSignature(
          {
            'webhook-signature': `v1,${wrongButSameLength} v1,${signature}`,
            'webhook-timestamp': timestamp,
            'webhook-id': 'wh1',
          },
          payload,
        ),
      ).resolves.toBe(true)
    })

    it('skips (without throwing) a candidate whose byte length does not match the expected signature', async () => {
      const payload = { a: 1 }
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = computeSignature('wh1', timestamp, payload)

      await expect(
        verifyWebhookSignature(
          {
            'webhook-signature': `v1,too-short v1,${signature}`,
            'webhook-timestamp': timestamp,
            'webhook-id': 'wh1',
          },
          payload,
        ),
      ).resolves.toBe(true)
    })

    it('returns false when the signature does not match', async () => {
      const payload = { a: 1 }
      const timestamp = Math.floor(Date.now() / 1000)
      // crypto.timingSafeEqual requires equal-length buffers, so this must be an otherwise-valid
      // (same length) signature computed for different input, not an arbitrary string.
      const wrongSignature = computeSignature('wh1', timestamp, { a: 2 })

      await expect(
        verifyWebhookSignature(
          { 'webhook-signature': `v1,${wrongSignature}`, 'webhook-timestamp': timestamp, 'webhook-id': 'wh1' },
          payload,
        ),
      ).resolves.toBe(false)
    })

    it('returns false when the signature matches but the timestamp is too old', async () => {
      const payload = { a: 1 }
      const timestamp = Math.floor(Date.now() / 1000) - 600
      const signature = computeSignature('wh1', timestamp, payload)

      await expect(
        verifyWebhookSignature(
          { 'webhook-signature': `v1,${signature}`, 'webhook-timestamp': timestamp, 'webhook-id': 'wh1' },
          payload,
        ),
      ).resolves.toBe(false)
    })
  })

  describe('getUser', () => {
    it('returns the parsed user data on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: { steamId: '765' } }) }),
      )
      await expect(getUser('u1')).resolves.toEqual({ data: { steamId: '765' } })
    })

    it('throws when the request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }))
      await expect(getUser('u1')).rejects.toThrow('Failed to fetch user data')
    })
  })

  describe('saveGmodStorePurchase', () => {
    it('creates a new purchase row and notifies the linked discord user', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

      await saveGmodStorePurchase('765', 'u1', false)

      expect(addNotificationMock).toHaveBeenCalledWith(
        'd1',
        'premium',
        'You have received a GmodStore lifetime purchase.',
      )
      expect(prismaMock.gm_gmodstore_purchases.create).toHaveBeenCalledWith({
        data: { steamID64: '765', revoke: false, userID: 'u1' },
      })
    })

    it('sends the revoke notification message when revoke is true', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

      await saveGmodStorePurchase('765', 'u1', true)

      expect(addNotificationMock).toHaveBeenCalledWith(
        'd1',
        'premium',
        'Your GmodStore lifetime purchase has been revoked.',
      )
    })

    it('updates the existing row when one is found', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValueOnce({ steamID64: '765' })
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)

      await saveGmodStorePurchase('765', 'u1', true)

      expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
        where: { steamID64: '765' },
        data: { revoke: true, userID: 'u1' },
      })
    })

    it('skips the notification when there is no linked discord user', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)

      await saveGmodStorePurchase('765', 'u1', false)

      expect(addNotificationMock).not.toHaveBeenCalled()
    })

    it('skips the notification when the linked user has no discord ID', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValueOnce(null)
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => null })

      await saveGmodStorePurchase('765', 'u1', false)

      expect(addNotificationMock).not.toHaveBeenCalled()
    })
  })

  describe('processGmodStoreWebhook', () => {
    it('returns 400 when userId is missing', async () => {
      const result = await processGmodStoreWebhook({ data: {} })
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('missing_arguments')
    })

    it('returns 404 when the gmodstore user has no linked steamId', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: {} }) }),
      )
      const result = await processGmodStoreWebhook({ data: { userId: 'u1' } })
      expect(result).toEqual({ status: 404, body: { error: 'user_not_found' } })
    })

    it('returns 400 when eventType is missing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: { steamId: '765' } }) }),
      )
      const result = await processGmodStoreWebhook({ data: { userId: 'u1' } })
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('missing_arguments')
    })

    it('returns 400 for an unrecognized event type', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: { steamId: '765' } }) }),
      )
      const result = await processGmodStoreWebhook({ data: { userId: 'u1' }, eventType: 'something.else' })
      expect(result).toEqual({ status: 400, body: { error: 'invalid_event_type' } })
    })

    const purchaseEvents: Array<{ eventType: string; revoke: boolean }> = [
      { eventType: 'product_purchase.created', revoke: false },
      { eventType: 'product_purchase.unrevoked', revoke: false },
      { eventType: 'product_purchase.deleted', revoke: true },
      { eventType: 'product_purchase.revoked', revoke: true },
    ]

    for (const { eventType, revoke } of purchaseEvents) {
      it(`processes "${eventType}" with revoke=${revoke} and returns 200`, async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: { steamId: '765' } }) }),
        )
        prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValueOnce(null)
        getUserFromSteamID64Mock.mockResolvedValueOnce(null)

        const result = await processGmodStoreWebhook({ data: { userId: 'u1' }, eventType })

        expect(result).toEqual({ status: 200, body: { success: true } })
        if (revoke) {
          expect(prismaMock.gm_gmodstore_purchases.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ revoke: true }) }),
          )
        } else {
          expect(prismaMock.gm_gmodstore_purchases.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ revoke: false }) }),
          )
        }
      })
    }
  })
})
