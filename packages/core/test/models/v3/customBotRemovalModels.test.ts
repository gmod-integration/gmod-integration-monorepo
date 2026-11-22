import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  gm_gmodstore_purchases: { updateMany: vi.fn(), findFirst: vi.fn() },
  gm_guild_settings: { deleteMany: vi.fn() },
}))
const transaction = vi.hoisted(() => vi.fn())
const clearCache = vi.hoisted(() => vi.fn())
vi.mock('@gmod/infra-prisma', () => ({ default: { ...database, $transaction: transaction } }))
vi.mock('@gmod/infra-redis', () => ({ default: { del: clearCache } }))

const { processDeleteGuildBotInstance } = await import('../../../src/models/v3/customBotRemovalModels.js')
const guild = { id: 'g1', mainBotOnGuild: vi.fn(), reloadBotInstance: vi.fn() }

beforeEach(() => {
  transaction.mockReset().mockImplementation(async (operation) => operation(database))
  database.gm_gmodstore_purchases.updateMany.mockReset().mockResolvedValue({ count: 1 })
  database.gm_gmodstore_purchases.findFirst.mockReset().mockResolvedValue(null)
  database.gm_guild_settings.deleteMany.mockReset().mockResolvedValue({ count: 1 })
  clearCache.mockReset().mockResolvedValue(1)
  guild.mainBotOnGuild.mockReset().mockResolvedValue(true)
  guild.reloadBotInstance.mockReset().mockResolvedValue(true)
})

describe('custom bot removal', () => {
  it('requires the dedicated main-bot check before changing stored configuration', async () => {
    guild.mainBotOnGuild.mockResolvedValueOnce(false)
    expect(await processDeleteGuildBotInstance(guild)).toEqual({
      status: 409,
      body: { error: 'main_bot_required' },
    })
    expect(transaction).not.toHaveBeenCalled()
    expect(clearCache).not.toHaveBeenCalled()
    expect(guild.reloadBotInstance).not.toHaveBeenCalled()
  })

  it('does not remove credentials when main-bot availability cannot be verified', async () => {
    guild.mainBotOnGuild.mockRejectedValueOnce(new Error('provider detail must not be exposed'))
    expect(await processDeleteGuildBotInstance(guild)).toEqual({
      status: 503,
      body: { error: 'main_bot_unavailable' },
    })
    expect(transaction).not.toHaveBeenCalled()
    expect(guild.reloadBotInstance).not.toHaveBeenCalled()
  })

  it('clears only the target guild credential and presence while preserving its entitlement and other guilds', async () => {
    const purchases = [
      { steamID64: 'owner', guild: 'g1', token: 'secret-one', revoke: false },
      { steamID64: 'revoked-owner', guild: 'g1', token: 'secret-two', revoke: true },
      { steamID64: 'other-owner', guild: 'g2', token: 'secret-other', revoke: false },
    ]
    database.gm_gmodstore_purchases.updateMany.mockImplementationOnce(async ({ where, data }) => {
      purchases
        .filter((purchase) => purchase.guild === where.guild)
        .forEach((purchase) => Object.assign(purchase, data))
      return { count: 2 }
    })
    expect(await processDeleteGuildBotInstance(guild)).toEqual({
      status: 200,
      body: { removed: true, tokenConfigured: false },
    })
    expect(database.gm_gmodstore_purchases.updateMany).toHaveBeenCalledWith({
      where: { guild: 'g1' },
      data: { token: '' },
    })
    expect(database.gm_guild_settings.deleteMany).toHaveBeenCalledWith({
      where: { guildID: 'g1', setting: 'bot_status' },
    })
    expect(purchases).toEqual([
      { steamID64: 'owner', guild: 'g1', token: '', revoke: false },
      { steamID64: 'revoked-owner', guild: 'g1', token: '', revoke: true },
      { steamID64: 'other-owner', guild: 'g2', token: 'secret-other', revoke: false },
    ])
    expect(clearCache).toHaveBeenCalledExactlyOnceWith('server:g1:setting:bot_status')
    expect(guild.reloadBotInstance).toHaveBeenCalledTimes(1)
    expect(database.gm_gmodstore_purchases.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      guild.reloadBotInstance.mock.invocationCallOrder[0],
    )
  })

  it('supports cleanup after expiry and retries even when no saved token remains', async () => {
    database.gm_gmodstore_purchases.updateMany.mockResolvedValueOnce({ count: 0 })
    database.gm_guild_settings.deleteMany.mockResolvedValueOnce({ count: 0 })
    expect((await processDeleteGuildBotInstance(guild)).status).toBe(200)
    expect(guild.reloadBotInstance).toHaveBeenCalledTimes(1)
  })

  it('does not claim runtime cleanup when the database change fails', async () => {
    transaction.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(processDeleteGuildBotInstance(guild)).rejects.toThrow('database unavailable')
    expect(clearCache).not.toHaveBeenCalled()
    expect(guild.reloadBotInstance).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'preserves a concurrent setup instead of reporting removal after a %s reload acknowledgement',
    async (acknowledged) => {
      let savedToken = 'original-credential-fixture'
      database.gm_gmodstore_purchases.updateMany.mockImplementationOnce(async () => {
        savedToken = ''
        return { count: 1 }
      })
      guild.reloadBotInstance.mockImplementationOnce(async () => {
        // An authorized PATCH commits after removal, before this reload observes storage.
        savedToken = 'new-credential-fixture'
        return acknowledged
      })
      database.gm_gmodstore_purchases.findFirst.mockImplementationOnce(async () =>
        savedToken ? { steamID64: 'owner' } : null,
      )

      expect(await processDeleteGuildBotInstance(guild)).toEqual({
        status: 409,
        body: { error: 'custom_bot_reconfigured', tokenConfigured: true },
      })
      expect(savedToken).toBe('new-credential-fixture')
      expect(database.gm_gmodstore_purchases.updateMany).toHaveBeenCalledTimes(1)
      expect(database.gm_gmodstore_purchases.findFirst).toHaveBeenCalledWith({
        where: { guild: 'g1', token: { not: '' } },
        select: { steamID64: true },
      })
      expect(database.gm_gmodstore_purchases.findFirst.mock.invocationCallOrder[0]).toBeGreaterThan(
        guild.reloadBotInstance.mock.invocationCallOrder[0],
      )
    },
  )

  it('does not assert the token state when final storage verification fails', async () => {
    database.gm_gmodstore_purchases.findFirst.mockRejectedValueOnce(new Error('Final read unavailable'))
    expect(await processDeleteGuildBotInstance(guild)).toEqual({
      status: 503,
      body: { error: 'custom_bot_state_unavailable' },
    })
    expect(database.gm_gmodstore_purchases.updateMany).toHaveBeenCalledTimes(1)
  })

  it.each(['rejected', 'negative acknowledgement', 'cache unavailable'])(
    'reports partial completion for %s',
    async (failure) => {
      if (failure === 'rejected') guild.reloadBotInstance.mockRejectedValueOnce(new Error('worker unavailable'))
      if (failure === 'negative acknowledgement') guild.reloadBotInstance.mockResolvedValueOnce(false)
      if (failure === 'cache unavailable') clearCache.mockRejectedValueOnce(new Error('Redis unavailable'))

      expect(await processDeleteGuildBotInstance(guild)).toEqual({
        status: 503,
        body: { error: 'custom_bot_disconnect_pending', tokenConfigured: false },
      })
      expect(database.gm_gmodstore_purchases.updateMany).toHaveBeenCalledTimes(1)
      expect(guild.reloadBotInstance).toHaveBeenCalledTimes(1)
    },
  )
})
