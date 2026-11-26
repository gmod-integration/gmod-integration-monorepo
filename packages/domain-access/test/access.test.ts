import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessSnapshot } from '@gmod/schema/server/AccessPolicySchema.js'

const mocks = vi.hoisted(() => ({ legacy: vi.fn(), purchase: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn() }))
vi.mock('@gmod/config', () => ({
  ConfigDiscord: {
    clientID: 'app',
    botToken: 'dummy-token',
    subscriptionSKUID: '1260321278208770150',
    subscriptionSKUIDs: ['1260321278208770150', '1224469371225636965'],
  },
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_guild_premium: { findFirst: mocks.legacy }, gm_gmodstore_purchases: { findFirst: mocks.purchase } },
}))
vi.mock('@gmod/infra-redis', () => ({ default: { get: mocks.get, set: mocks.set, del: mocks.del } }))
const {
  resolveGuildAccess,
  invalidateGuildAccess,
  assertCapability,
  assertQuota,
  effectiveServerSetting,
  effectiveGuildSetting,
  assertServerSettingChange,
  assertGuildSettingChange,
  getDiscordEntitlements,
} = await import('../src/index.js')

const ready = (overrides: Partial<AccessSnapshot> = {}): AccessSnapshot => ({
  guildID: 'g1',
  premium: false,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: 'revision',
  validUntil: '2030-01-01T00:00:00.000Z',
  ...overrides,
})
const entitlement = (overrides: Record<string, unknown> = {}) => ({
  id: '1',
  application_id: 'app',
  sku_id: '1260321278208770150',
  guild_id: 'g1',
  deleted: false,
  starts_at: null,
  ends_at: null,
  ...overrides,
})
const respond = (body: unknown) => ({ ok: true, json: async () => body })

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-21T12:00:00.000Z'))
  mocks.legacy.mockResolvedValue(null)
  mocks.purchase.mockResolvedValue(null)
  mocks.get.mockResolvedValue(null)
  mocks.set.mockResolvedValue('OK')
  mocks.del.mockResolvedValue(1)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([])))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('one authoritative entitlement resolution', () => {
  it.each(['1260321278208770150', '1224469371225636965'])(
    'grants Premium for the active or retired subscription SKU %s',
    async (sku_id) => {
      vi.mocked(fetch).mockResolvedValue(respond([entitlement({ sku_id })]) as Response)
      expect(await resolveGuildAccess('g1')).toMatchObject({
        premium: true,
        customBot: false,
        sources: ['discord'],
        state: 'ready',
      })
    },
  )
  it('combines legacy and GmodStore sources and keeps custom bot separate from a subscription', async () => {
    mocks.legacy.mockResolvedValue({ guildID: 'g1' })
    mocks.purchase.mockResolvedValue({ guild: 'g1' })
    expect(await resolveGuildAccess('g1')).toMatchObject({
      premium: true,
      customBot: true,
      sources: ['legacy', 'gmodstore'],
      state: 'ready',
    })
    expect(mocks.purchase).toHaveBeenCalledWith({ where: { guild: 'g1', revoke: false } })
    expect(mocks.legacy).toHaveBeenCalledWith({ where: { guildID: 'g1', revoked: false } })
    expect(fetch).not.toHaveBeenCalled()
    mocks.legacy.mockResolvedValue(null)
    mocks.purchase.mockResolvedValue(null)
    vi.mocked(fetch).mockResolvedValue(respond([entitlement()]) as Response)
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: true, customBot: false, sources: ['discord'] })
  })
  it('does not grant access from a revoked local record even when its financial metadata remains', async () => {
    mocks.legacy.mockResolvedValue({
      guildID: 'g1',
      revoked: true,
      transaction: 'legacy-transaction',
      buyer: 'legacy-buyer',
    })
    expect(await resolveGuildAccess('g1')).toMatchObject({
      premium: false,
      customBot: false,
      sources: [],
      state: 'ready',
    })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('retains purchased or Discord access independently of a revoked local grant', async () => {
    mocks.legacy.mockResolvedValue({ guildID: 'g1', revoked: true })
    mocks.purchase.mockResolvedValueOnce({ guild: 'g1', revoke: false })
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: true, customBot: true, sources: ['gmodstore'] })
    vi.mocked(fetch).mockResolvedValue(respond([entitlement()]) as Response)
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: true, customBot: false, sources: ['discord'] })
  })
  it('restores a re-enabled local grant without requiring provider changes', async () => {
    mocks.legacy
      .mockResolvedValueOnce({ guildID: 'g1', revoked: true })
      .mockResolvedValueOnce({ guildID: 'g1', revoked: false, transaction: 'preserved', buyer: 'preserved' })
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: false, sources: [] })
    await invalidateGuildAccess('g1')
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: true, sources: ['legacy'] })
  })
  it.each([
    { guild_id: 'other' },
    { application_id: 'other' },
    { sku_id: 'other' },
    { deleted: true },
    { consumed: true },
    { starts_at: '2026-11-21T13:00:00.000Z' },
    { ends_at: '2026-11-21T11:59:59.000Z' },
  ])('does not grant access for an invalid entitlement: %j', async (override) => {
    vi.mocked(fetch).mockResolvedValue(respond([entitlement(override)]) as Response)
    expect(await resolveGuildAccess('g1')).toMatchObject({
      premium: false,
      customBot: false,
      sources: [],
      state: 'ready',
    })
  })
  it('uses the configured guild and SKU filters and follows every page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => entitlement({ id: String(i + 1), guild_id: 'other' }))
    vi.mocked(fetch)
      .mockResolvedValueOnce(respond(firstPage) as Response)
      .mockResolvedValueOnce(respond([entitlement({ id: '101' })]) as Response)
    expect((await resolveGuildAccess('g1')).premium).toBe(true)
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)))
    expect(urls).toHaveLength(2)
    expect(urls[0]!.searchParams.get('sku_ids')).toBe('1260321278208770150,1224469371225636965')
    expect(urls[0]!.searchParams.get('guild_id')).toBe('g1')
    expect(urls[0]!.searchParams.get('exclude_ended')).toBe('true')
    expect(urls[1]!.searchParams.get('after')).toBe('100')
  })
  it('deduplicates repeated entitlements across pages without dropping either subscription offer', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => entitlement({ id: String(index + 1) }))
    vi.mocked(fetch)
      .mockResolvedValueOnce(respond(firstPage) as Response)
      .mockResolvedValueOnce(
        respond([entitlement({ id: '100' }), entitlement({ id: '101', sku_id: '1224469371225636965' })]) as Response,
      )
    const entries = await getDiscordEntitlements()
    expect(entries).toHaveLength(101)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(101)
    expect(new Set(entries.map((entry) => entry.sku_id))).toEqual(
      new Set(['1260321278208770150', '1224469371225636965']),
    )
  })
  it('preserves Premium from the retired offer after a newer subscription expires', async () => {
    vi.mocked(fetch).mockResolvedValue(
      respond([
        entitlement({ id: 'current', ends_at: '2026-11-21T12:00:05.000Z' }),
        entitlement({ id: 'legacy', sku_id: '1224469371225636965', ends_at: '2026-11-21T12:00:10.000Z' }),
      ]) as Response,
    )
    expect(await resolveGuildAccess('g1')).toMatchObject({
      premium: true,
      sources: ['discord'],
      validUntil: '2026-11-21T12:00:10.000Z',
    })
    vi.setSystemTime(new Date('2026-11-21T12:00:05.000Z'))
    expect((await resolveGuildAccess('g1')).premium).toBe(true)
    vi.setSystemTime(new Date('2026-11-21T12:00:10.000Z'))
    expect((await resolveGuildAccess('g1')).premium).toBe(false)
  })
  it('bounds a positive proof at the expiry of its last active source', async () => {
    vi.mocked(fetch).mockResolvedValue(respond([entitlement({ ends_at: '2026-11-21T12:00:10.000Z' })]) as Response)
    const value = await resolveGuildAccess('g1')
    expect(value.validUntil).toBe('2026-11-21T12:00:10.000Z')
    expect(mocks.set).toHaveBeenCalledWith('guild:g1:access:v1', JSON.stringify(value), 'EX', 10)
    mocks.get.mockResolvedValue(JSON.stringify(value))
    vi.setSystemTime(new Date('2026-11-21T12:00:10.000Z'))
    expect((await resolveGuildAccess('g1')).premium).toBe(false)
  })
  it('revalidates a cached proof against the time when Redis returns it', async () => {
    const cached = ready({
      premium: true,
      sources: ['discord'],
      validUntil: '2026-11-21T12:00:01.000Z',
    })
    mocks.get.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(cached.validUntil))
      return JSON.stringify(cached)
    })

    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: false, sources: [], state: 'ready' })
    expect(mocks.legacy).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('uses the resolution time for a subscription that starts during a slow provider lookup', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2026-11-21T12:01:10.000Z'))
      return respond([
        entitlement({ starts_at: '2026-11-21T12:01:05.000Z', ends_at: '2026-11-21T12:01:20.000Z' }),
      ]) as Response
    })

    const access = await resolveGuildAccess('g1')
    expect(access).toMatchObject({ premium: true, sources: ['discord'], state: 'ready' })
    expect(access.validUntil).toBe('2026-11-21T12:01:20.000Z')
    expect(mocks.set).toHaveBeenCalledWith('guild:g1:access:v1', JSON.stringify(access), 'EX', 10)
  })
  it('keeps another valid source when one source is revoked', async () => {
    mocks.purchase.mockResolvedValueOnce({ guild: 'g1' }).mockResolvedValue(null)
    expect((await resolveGuildAccess('g1')).customBot).toBe(true)
    await invalidateGuildAccess('g1')
    vi.mocked(fetch).mockResolvedValue(respond([entitlement()]) as Response)
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: true, customBot: false, sources: ['discord'] })
    expect(mocks.del).toHaveBeenCalledWith('guild:g1:access:v1', 'guild:g1:premium')
  })
  it('distinguishes a provider outage from Free without caching a false subscription state', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Unavailable'))
    const access = await resolveGuildAccess('g1')
    expect(access).toMatchObject({ premium: false, state: 'unknown' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(() => assertCapability(access, 'status.chart')).toThrow(
      expect.objectContaining({ code: 'entitlement_unknown', status: 503 }),
    )
    expect(() => assertQuota(access, 'sync.roles.rules', 3)).not.toThrow()
    expect(() => assertQuota(access, 'sync.roles.rules', 4)).toThrow(
      expect.objectContaining({ code: 'entitlement_unknown', status: 503 }),
    )
    expect((await resolveGuildAccess('g1')).state).toBe('ready')
  })
  it('still resolves database grants while Redis or Discord is unavailable', async () => {
    mocks.get.mockRejectedValue(new Error('Redis down'))
    mocks.set.mockRejectedValue(new Error('Redis down'))
    mocks.legacy.mockResolvedValue({ guildID: 'g1' })
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: true, state: 'ready' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not trust legacy bare boolean cache entries or malformed snapshots', async () => {
    mocks.get.mockResolvedValueOnce('true').mockResolvedValueOnce('{broken')
    expect((await resolveGuildAccess('g1')).premium).toBe(false)
    expect((await resolveGuildAccess('g1')).premium).toBe(false)
    expect(mocks.legacy).toHaveBeenCalledTimes(2)
  })
  it('supersedes an in-flight positive provider result when a revocation invalidates access', async () => {
    let finish!: (value: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = resolveGuildAccess('g1')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await invalidateGuildAccess('g1')
    finish(respond([entitlement()]) as Response)
    expect(await pending).toMatchObject({ premium: false, state: 'ready' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.set.mock.calls.every(([, serialized]) => !JSON.parse(serialized).premium)).toBe(true)
  })
  it('bypasses an old Redis proof after a locally observed invalidation even if deleting it failed', async () => {
    mocks.get.mockResolvedValue(JSON.stringify(ready({ premium: true, sources: ['discord'] })))
    mocks.del.mockRejectedValueOnce(new Error('Redis temporarily unavailable'))
    await expect(invalidateGuildAccess('g1')).rejects.toThrow('Redis temporarily unavailable')
    expect(await resolveGuildAccess('g1')).toMatchObject({ premium: false, state: 'ready' })
    expect(mocks.get).not.toHaveBeenCalled()
  })
})

describe('one setting and action policy', () => {
  it('requires the right for activation but always allows restoring free settings', () => {
    const free = ready()
    expect(() => assertServerSettingChange(free, 'show_status_chart', true, false)).toThrow(
      expect.objectContaining({ code: 'upgrade_required', capability: 'status.chart' }),
    )
    expect(() => assertServerSettingChange(free, 'show_status_chart', false, true)).not.toThrow()
    expect(() => assertServerSettingChange(free, 'sync_role_direction', 'gmod-to-discord', 'both')).not.toThrow()
    expect(() => assertServerSettingChange(free, 'chat_sync_relay_all', true, false)).not.toThrow()
    expect(() => assertGuildSettingChange(free, 'verification_dont_mp', false, true)).not.toThrow()
    expect(() => assertGuildSettingChange(free, 'bot_status', 'disabled', 'rotate')).not.toThrow()
    expect(() => assertGuildSettingChange(free, 'verification_dont_mp', true, false)).toThrow(
      expect.objectContaining({ code: 'upgrade_required' }),
    )
    expect(() => assertServerSettingChange(free, 'show_status_chart', true, true)).not.toThrow()
  })
  it('preserves saved values while producing safe effective settings after expiry', () => {
    const access = ready({ state: 'unknown' })
    expect(effectiveServerSetting(access, 'show_status_chart', true)).toBe(false)
    expect(effectiveServerSetting(access, 'sync_role_direction', 'both')).toBe('gmod-to-discord')
    expect(effectiveServerSetting(access, 'sync_pseudo_direction', 'disable')).toBe('disable')
    expect(effectiveServerSetting(access, 'chat_sync_relay_all', false)).toBe(true)
    expect(effectiveGuildSetting(access, 'verification_dont_mp', true)).toBe(false)
    expect(effectiveGuildSetting(access, 'bot_status', 'rotate')).toBe('disabled')
    expect(effectiveServerSetting(access, 'pseudoFormat', '{plyName}')).toBe('{plyName}')
    expect(effectiveServerSetting(ready({ premium: true }), 'show_status_chart', true)).toBe(true)
  })
  it('enforces numeric limits while preserving custom bot eligibility', () => {
    expect(() => assertQuota(ready(), 'sync.roles.rules', 4)).toThrow(
      expect.objectContaining({ code: 'quota_reached', used: 4, limit: 4 }),
    )
    expect(() => assertQuota(ready({ premium: true }), 'status.buttons', 25)).toThrow(
      expect.objectContaining({ code: 'quota_reached', limit: 25 }),
    )
    expect(() => assertCapability(ready({ premium: true }), 'bot.custom')).toThrow(
      expect.objectContaining({ code: 'upgrade_required' }),
    )
    expect(() => assertCapability(ready({ premium: true, customBot: true }), 'bot.custom')).not.toThrow()
  })
})
