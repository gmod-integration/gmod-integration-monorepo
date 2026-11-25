import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invalidateAccess = vi.hoisted(() => vi.fn())
const reloadBot = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', () => ({ invalidateGuildAccess: invalidateAccess }))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildReloadBotInstance: reloadBot }))

const signingSecretKey = 'whsec_' + Buffer.from('super-secret-signing-key').toString('base64')
vi.mock('@gmod/config', () => ({
  ConfigGmodStore: { signingSecretKey, apiKey: 'api-key-1' },
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: gmLogMock }))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const addNotificationMock = vi.fn()
vi.mock('../../../src/utils/tools.js', () => ({ addNotification: addNotificationMock }))

const prismaMock: any = {
  gm_gmodstore_purchases: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  gm_user_erasure: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}
const redisDelMock = vi.fn()
vi.mock('@gmod/infra-redis', () => ({ default: { del: redisDelMock } }))
vi.mock('@gmod/domain-user/privacy.js', () => ({
  privacySubject: (provider: string, id: string) => `${provider}:private:${id}`,
}))
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { verifyWebhookSignature, getUser, saveGmodStorePurchase, processGmodStoreWebhook } =
  await import('../../../src/models/webhooks/gmodStoreModels.js')

function computeSignature(webhookId: string, webhookTimestamp: number, payload: any) {
  const rawSecret = signingSecretKey.replace('whsec_', '')
  return crypto
    .createHmac('sha256', Buffer.from(rawSecret, 'base64'))
    .update(`${webhookId}.${webhookTimestamp}.${JSON.stringify(payload)}`)
    .digest('base64')
}

function resetAllMocks() {
  invalidateAccess.mockReset().mockResolvedValue(undefined)
  reloadBot.mockReset().mockResolvedValue(undefined)
  gmLogMock.mockClear()
  getUserFromSteamID64Mock.mockReset()
  addNotificationMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    if (!table || typeof table !== 'object') continue
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  prismaMock.$transaction.mockReset().mockImplementation((operation: (tx: unknown) => unknown) => operation(prismaMock))
  redisDelMock.mockReset()
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

    it('applies refunds to the retained community purchase without restoring erased identifiers or notifying a recreated account', async () => {
      const retainedKey = 'erased:steam:private:765'
      prismaMock.gm_gmodstore_purchases.findUnique.mockImplementation(({ where }: { where: { steamID64: string } }) =>
        Promise.resolve(
          where.steamID64 === retainedKey ? { steamID64: retainedKey, guild: 'community', revoke: false } : null,
        ),
      )
      getUserFromSteamID64Mock.mockResolvedValue({ getDiscordID: () => 'new-account' })
      await saveGmodStorePurchase('765', 'personal-store-id', true)
      expect(prismaMock.gm_gmodstore_purchases.upsert).toHaveBeenCalledWith({
        where: { steamID64: retainedKey },
        create: { steamID64: retainedKey, guild: 'community', revoke: true, userID: '', token: '' },
        update: { guild: 'community', revoke: true, userID: '', token: '' },
      })
      expect(prismaMock.gm_gmodstore_purchases.create).not.toHaveBeenCalled()
      expect(prismaMock.gm_gmodstore_purchases.update).not.toHaveBeenCalled()
      expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
      expect(addNotificationMock).not.toHaveBeenCalled()
      expect(gmLogMock.mock.calls.flat().join(' ')).not.toContain('765')
      expect(invalidateAccess).toHaveBeenCalledWith('community')
      expect(reloadBot).toHaveBeenCalledWith('community')
    })

    it('keeps a historical erasure private after OAuth reactivation, even if no purchase row existed during erasure', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValue(null)
      prismaMock.gm_user_erasure.findFirst.mockResolvedValue({ id: 'old-proof', reactivatedAt: new Date() })
      await saveGmodStorePurchase('765', 'personal-store-id', false)
      expect(prismaMock.gm_user_erasure.findFirst).toHaveBeenCalledWith({
        where: { steamSubject: 'steam:private:765' },
        select: { id: true },
      })
      expect(prismaMock.gm_gmodstore_purchases.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { steamID64: 'erased:steam:private:765', guild: '', revoke: false, userID: '', token: '' },
        }),
      )
      expect(prismaMock.gm_gmodstore_purchases.create).not.toHaveBeenCalled()
      expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
      expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    })

    it('merges an old duplicate personal row into the same retained assignment without a primary-key collision', async () => {
      const retainedKey = 'erased:steam:private:765'
      prismaMock.gm_gmodstore_purchases.findUnique.mockImplementation(({ where }: { where: { steamID64: string } }) =>
        Promise.resolve({ steamID64: where.steamID64, guild: 'community', revoke: false }),
      )
      await saveGmodStorePurchase('765', 'do-not-restore', true)
      expect(prismaMock.gm_gmodstore_purchases.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { steamID64: retainedKey },
          update: { guild: 'community', revoke: true, userID: '', token: '' },
        }),
      )
      expect(prismaMock.gm_gmodstore_purchases.deleteMany).toHaveBeenCalledWith({ where: { steamID64: '765' } })
      expect(prismaMock.gm_gmodstore_purchases.create).not.toHaveBeenCalled()
    })

    it('refuses to silently discard a different community entitlement when duplicate historical assignments conflict', async () => {
      prismaMock.gm_gmodstore_purchases.findUnique.mockImplementation(({ where }: { where: { steamID64: string } }) =>
        Promise.resolve({
          steamID64: where.steamID64,
          guild: where.steamID64 === '765' ? 'new-community' : 'old-community',
        }),
      )
      await expect(saveGmodStorePurchase('765', 'u1', true)).rejects.toThrow(
        'Conflicting collective purchase assignments require review',
      )
      expect(prismaMock.gm_gmodstore_purchases.upsert).not.toHaveBeenCalled()
      expect(prismaMock.gm_gmodstore_purchases.deleteMany).not.toHaveBeenCalled()
    })

    it.each(['cache', 'reload'])(
      'acknowledges a committed revocation when post-commit %s synchronization fails',
      async (failure) => {
        prismaMock.gm_gmodstore_purchases.findUnique.mockImplementation(
          async ({ where }: { where: { steamID64: string } }) =>
            where.steamID64 === '765' ? { steamID64: '765', guild: 'community' } : null,
        )
        getUserFromSteamID64Mock.mockResolvedValue({ getDiscordID: () => 'discord-user' })
        if (failure === 'cache') invalidateAccess.mockRejectedValueOnce(new Error('Cache unavailable'))
        else reloadBot.mockRejectedValueOnce(new Error('Queue unavailable'))
        await expect(saveGmodStorePurchase('765', 'store-user', true)).resolves.toBeUndefined()
        expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
          where: { steamID64: '765' },
          data: { revoke: true, userID: 'store-user' },
        })
        expect(invalidateAccess).toHaveBeenCalledWith('community')
        expect(addNotificationMock).toHaveBeenCalledTimes(1)
      },
    )

    it('retries a serialization conflict without sending duplicate notifications', async () => {
      prismaMock.$transaction.mockRejectedValueOnce({ code: 'P2034' })
      prismaMock.gm_gmodstore_purchases.findUnique.mockResolvedValue(null)
      getUserFromSteamID64Mock.mockResolvedValue({ getDiscordID: () => 'd1' })
      await saveGmodStorePurchase('765', 'u1', false)
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
      expect(prismaMock.gm_gmodstore_purchases.create).toHaveBeenCalledTimes(1)
      expect(addNotificationMock).toHaveBeenCalledTimes(1)
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
