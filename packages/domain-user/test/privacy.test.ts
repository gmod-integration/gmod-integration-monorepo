import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { clientSecret: 'oauth-tests-only-secret' },
  ConfigPrivacy: { hashSecret: 'privacy-tests-only-secret' },
}))
const erasure = { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }
const security = { findUnique: vi.fn() }
const panel = { deleteMany: vi.fn() }
const discord = { deleteMany: vi.fn() }
const user = { updateMany: vi.fn() }
const transaction = vi.fn()
const prismaMock = {
  gm_user_erasure: erasure,
  gm_user_security: security,
  gm_panelToken: panel,
  gm_discordToken: discord,
  gm_user: user,
  $transaction: transaction,
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  privacySubject,
  isErasureBlocked,
  assertPersonalDataAllowed,
  getRetainedTrust,
  prepareExplicitOAuthLogin,
  PersonalDataErasureError,
} = await import('../src/privacy.js')
const { getErasedSteamIDs } = await import('@gmod/infra-prisma/privacy.js')
const { ConfigDiscord, ConfigPrivacy } = await import('@gmod/config')

beforeEach(() => {
  vi.resetAllMocks()
  erasure.findFirst.mockResolvedValue(null)
  erasure.findMany.mockResolvedValue([])
  erasure.updateMany.mockResolvedValue({ count: 1 })
  security.findUnique.mockResolvedValue(null)
  transaction.mockImplementation(async (operation) => operation(prismaMock))
})

describe('privacy suppression', () => {
  it('allows legacy operation without querying new tables when the privacy feature is not configured', async () => {
    const previousSecret = ConfigPrivacy.hashSecret
    try {
      ConfigPrivacy.hashSecret = undefined
      await expect(isErasureBlocked('d1', '765')).resolves.toBe(false)
      await expect(getErasedSteamIDs(['765'])).resolves.toEqual(new Set())
      await expect(getRetainedTrust('d1', '765')).resolves.toBeNull()
      await expect(prepareExplicitOAuthLogin('d1')).resolves.toBeUndefined()
      expect(erasure.findFirst).not.toHaveBeenCalled()
      expect(erasure.findMany).not.toHaveBeenCalled()
      expect(security.findUnique).not.toHaveBeenCalled()
      expect(transaction).not.toHaveBeenCalled()
    } finally {
      ConfigPrivacy.hashSecret = previousSecret
    }
  })
  it('uses stable provider-scoped keyed identifiers without storing the original ID', () => {
    const discordSubject = privacySubject('discord', '12345678901234567')
    expect(discordSubject).toMatch(/^[0-9a-f]{64}$/)
    expect(discordSubject).toBe(privacySubject('discord', '12345678901234567'))
    expect(discordSubject).not.toBe(privacySubject('steam', '12345678901234567'))
    expect(discordSubject).not.toContain('12345678901234567')
  })

  it('keeps suppression identifiers stable when OAuth credentials rotate', () => {
    const subject = privacySubject('discord', 'd1')
    const previousSecret = ConfigDiscord.clientSecret
    try {
      ConfigDiscord.clientSecret = 'rotated-oauth-secret'
      expect(privacySubject('discord', 'd1')).toBe(subject)
    } finally {
      ConfigDiscord.clientSecret = previousSecret
    }
  })

  it('keeps the legacy subject fallback usable before a dedicated privacy key is configured', () => {
    const configured = privacySubject('discord', 'd1')
    const secret = ConfigPrivacy.hashSecret
    try {
      ConfigPrivacy.hashSecret = undefined
      const legacy = privacySubject('discord', 'd1')
      expect(legacy).toMatch(/^[0-9a-f]{64}$/)
      expect(legacy).not.toBe(configured)
      expect(privacySubject('discord', ' d1 ')).toBe(legacy)
      expect(privacySubject('steam', 'd1')).not.toBe(legacy)
    } finally {
      ConfigPrivacy.hashSecret = secret
    }
  })

  it('looks up either identity and only active suppression markers', async () => {
    erasure.findFirst.mockResolvedValue({ id: 'request' })
    await expect(isErasureBlocked('d1', '765')).resolves.toBe(true)
    expect(erasure.findFirst).toHaveBeenCalledWith({
      where: {
        reactivatedAt: null,
        OR: [{ discordSubject: privacySubject('discord', 'd1') }, { steamSubject: privacySubject('steam', '765') }],
      },
      select: { id: true },
    })
  })

  it('allows data without an erasure marker and does not query for absent identities', async () => {
    await expect(isErasureBlocked()).resolves.toBe(false)
    expect(erasure.findFirst).not.toHaveBeenCalled()
    await expect(assertPersonalDataAllowed('d1')).resolves.toBeUndefined()
  })

  it('rejects collection while the marker remains active, including after completion', async () => {
    erasure.findFirst.mockResolvedValue({ id: 'completed-request' })
    await expect(assertPersonalDataAllowed(undefined, '765')).rejects.toBeInstanceOf(PersonalDataErasureError)
  })

  it('fails closed when the privacy store is unavailable', async () => {
    erasure.findFirst.mockRejectedValue(new Error('database unavailable'))
    await expect(assertPersonalDataAllowed('d1')).rejects.toThrow('database unavailable')
  })

  it('restores a zero trust score and falls back to a proven Steam identity only when needed', async () => {
    security.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ trust: 0 })
    await expect(getRetainedTrust('d1', '765')).resolves.toBe(0)
    expect(security.findUnique).toHaveBeenLastCalledWith({
      where: { subject: privacySubject('steam', '765') },
      select: { trust: true },
    })
  })

  it('does not replace a retained Discord score with another identity or the default', async () => {
    security.findUnique.mockResolvedValueOnce({ trust: 0 })
    await expect(getRetainedTrust('d1', '765')).resolves.toBe(0)
    expect(security.findUnique).toHaveBeenCalledTimes(1)
  })

  it('checks a player batch with one query and maps only matched identities back to their IDs', async () => {
    erasure.findMany.mockResolvedValue([{ steamSubject: privacySubject('steam', '765-erased') }])
    await expect(getErasedSteamIDs(['765-other', '765-erased'])).resolves.toEqual(new Set(['765-erased']))
    expect(erasure.findMany).toHaveBeenCalledTimes(1)
    expect(erasure.findMany).toHaveBeenCalledWith({
      where: {
        reactivatedAt: null,
        steamSubject: { in: [privacySubject('steam', '765-other'), privacySubject('steam', '765-erased')] },
      },
      select: { steamSubject: true },
    })
  })

  it('does not query suppression state for an empty or blank-only player batch', async () => {
    await expect(getErasedSteamIDs([])).resolves.toEqual(new Set())
    await expect(getErasedSteamIDs(['', ''])).resolves.toEqual(new Set())
    expect(erasure.findMany).not.toHaveBeenCalled()
  })

  it('maps only requested identities even when legacy rows have no Steam subject or an unrelated subject', async () => {
    erasure.findMany.mockResolvedValue([
      { steamSubject: null },
      { steamSubject: privacySubject('steam', 'not-in-this-batch') },
      { steamSubject: privacySubject('steam', '765-erased') },
    ])
    await expect(getErasedSteamIDs(['765-erased', '765-other'])).resolves.toEqual(new Set(['765-erased']))
    expect(erasure.findMany).toHaveBeenCalledTimes(1)
  })
})

describe('explicit OAuth reactivation', () => {
  it.each(['pending', 'running', 'retry'])('refuses an OAuth callback while erasure is %s', async (status) => {
    erasure.findMany.mockResolvedValue([{ id: 'request', status }])
    await expect(prepareExplicitOAuthLogin('d1')).rejects.toBeInstanceOf(PersonalDataErasureError)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('reactivates a completed account without restoring its previous link, privilege or sessions', async () => {
    erasure.findMany.mockResolvedValue([{ id: 'request', status: 'completed' }])
    security.findUnique.mockResolvedValue({ trust: 0 })
    await prepareExplicitOAuthLogin('d1')
    expect(panel.deleteMany).toHaveBeenCalledWith({ where: { discordID: 'd1' } })
    expect(discord.deleteMany).toHaveBeenCalledWith({ where: { discordID: 'd1' } })
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { steam: null, email: null, token: null, token_expires: null, rank: 'user', trust: 0 },
    })
    expect(erasure.updateMany).toHaveBeenCalledWith({
      where: { discordSubject: privacySubject('discord', 'd1'), status: 'completed', reactivatedAt: null },
      data: { reactivatedAt: expect.any(Date) },
    })
  })

  it('does not reactivate completed requests when another erasure is still pending', async () => {
    erasure.findMany.mockResolvedValue([
      { id: 'older', status: 'completed' },
      { id: 'new', status: 'pending' },
    ])
    await expect(prepareExplicitOAuthLogin('d1')).rejects.toBeInstanceOf(PersonalDataErasureError)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a concurrent transition rather than deleting a newly created session', async () => {
    erasure.findMany.mockResolvedValue([{ id: 'request', status: 'completed' }])
    erasure.updateMany.mockResolvedValue({ count: 0 })
    await expect(prepareExplicitOAuthLogin('d1')).rejects.toBeInstanceOf(PersonalDataErasureError)
    expect(panel.deleteMany).not.toHaveBeenCalled()
  })

  it('leaves a normal login unchanged when there is no active erasure marker', async () => {
    await prepareExplicitOAuthLogin('d1')
    expect(transaction).not.toHaveBeenCalled()
  })
})
