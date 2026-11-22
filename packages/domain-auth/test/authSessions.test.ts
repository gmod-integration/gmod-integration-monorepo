import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const blocked = vi.fn().mockResolvedValue(false)
vi.mock('@gmod/infra-prisma/privacy.js', () => ({ isErasureBlocked: blocked }))
const findMany = vi.fn(),
  findFirst = vi.fn(),
  create = vi.fn(),
  updateMany = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_panelToken: { findMany, findFirst, create, updateMany } } }))
const publish = vi.fn(),
  set = vi.fn(),
  getdel = vi.fn()
vi.mock('@gmod/infra-redis', () => ({ default: { publish, set, getdel } }))
vi.mock('@gmod/config', () => ({
  ConfigAuth: { sessionAbsoluteTtlSeconds: 2592000, sessionIdleTtlSeconds: 604800, wsTicketTtlSeconds: 30 },
  ConfigDiscord: { clientSecret: 'test-stable-auth-signing-secret' },
  ConfigServer: { domain: 'https://api.example.test', websiteUrl: 'https://app.example.test', dev: false },
}))

const {
  assertSessionRequest,
  createApplicationSession,
  csrfTokenForSession,
  hashSessionToken,
  issueWebSocketTicket,
  consumeWebSocketTicket,
  listApplicationSessions,
  migrateApplicationSession,
  resolveApplicationSession,
  resolveRequestSession,
  revokeApplicationSession,
  serializeAuthCookie,
  validateApplicationSession,
} = await import('../src/authSessions.js')

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-a',
    discordID: 'user-a',
    accessToken: hashSessionToken('original-credential'),
    revoke: false,
    createdAt: new Date('2026-01-01'),
    creationDate: new Date('2026-01-01'),
    lastSeenAt: new Date(),
    expirationDate: new Date(Date.now() + 600_000),
    absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    actorDiscordID: null,
    actorSessionID: null,
    os: 'Linux',
    browser: 'Firefox',
    ip: '192.0.2.1',
    country: 'FR',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  blocked.mockResolvedValue(false)
  updateMany.mockResolvedValue({ count: 1 })
  publish.mockResolvedValue(1)
  set.mockResolvedValue('OK')
  getdel.mockResolvedValue(null)
  findFirst.mockResolvedValue(null)
  findMany.mockResolvedValue([])
  create.mockImplementation(async ({ data }) => ({ ...data, createdAt: data.creationDate, revoke: false }))
})
afterEach(() => vi.useRealTimers())

describe('application session identity and lifetime', () => {
  it('creates a hashed credential with independent absolute and inactivity deadlines', async () => {
    const start = Date.now()
    const result = await createApplicationSession('user-a', { os: 'Linux' })
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const data = create.mock.calls[0][0].data
    expect(data.accessToken).toBe(hashSessionToken(result.token))
    expect(data.accessToken).not.toContain(result.token)
    expect(data.absoluteExpiresAt.getTime()).toBeGreaterThanOrEqual(start + 2_592_000_000)
    expect(data.expirationDate.getTime()).toBeLessThanOrEqual(Date.now() + 604_800_000)
    expect(result.session.id).toBe(data.id)
  })

  it('resolves the presented session and refuses ambiguous tokens or database hashes as credentials', async () => {
    findMany.mockResolvedValue([row()])
    const session = await resolveApplicationSession('original-credential')
    expect(session?.id).toBe('session-a')
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accessToken: { in: ['original-credential', hashSessionToken('original-credential')] },
        }),
      }),
    )
    findMany.mockResolvedValue([row(), row({ id: 'other' })])
    expect(await resolveApplicationSession('original-credential')).toBeNull()
    findMany.mockClear()
    expect(await resolveApplicationSession(hashSessionToken('original-credential'))).toBeNull()
    expect(findMany).not.toHaveBeenCalled()
  })

  it('does not extend revoked or absolutely expired sessions', async () => {
    findMany
      .mockResolvedValueOnce([row({ revoke: true })])
      .mockResolvedValueOnce([row({ absoluteExpiresAt: new Date(0) })])
    expect(await resolveApplicationSession('original-credential')).toBeNull()
    expect(await resolveApplicationSession('original-credential')).toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('does not accept a session expiring during a slow privacy read', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    findMany.mockResolvedValue([row({ expirationDate: new Date(now + 1000) })])
    blocked.mockImplementationOnce(async () => {
      vi.setSystemTime(now + 2000)
      return false
    })
    expect(await resolveApplicationSession('original-credential')).toBeNull()
  })

  it('rechecks the clock after the final asynchronous privacy barrier', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    findMany.mockResolvedValue([row({ expirationDate: new Date(now + 1000) })])
    blocked.mockResolvedValueOnce(false).mockImplementationOnce(async () => {
      vi.setSystemTime(now + 2000)
      return false
    })
    expect(await resolveApplicationSession('original-credential', { touch: false })).toBeNull()
  })

  it('bounds activity renewal by the absolute deadline and loses safely to a concurrent revocation', async () => {
    const absolute = new Date(Date.now() + 300_000)
    findMany.mockResolvedValue([row({ lastSeenAt: new Date(0), absoluteExpiresAt: absolute })])
    const session = await resolveApplicationSession('original-credential')
    expect(session?.expiresAt).toEqual(absolute)
    updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await resolveApplicationSession('original-credential')).toBeNull()
  })

  it('never extends a legacy session merely because it is read', async () => {
    findMany.mockResolvedValue([row({ absoluteExpiresAt: null, lastSeenAt: null })])
    expect(await resolveApplicationSession('original-credential')).not.toBeNull()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('migrates only a currently valid owner credential using a conditional rotation', async () => {
    let current = row({ accessToken: 'legacy-token', absoluteExpiresAt: null })
    findMany.mockResolvedValue([current])
    updateMany.mockImplementationOnce(async ({ data }) => {
      current = { ...current, ...data }
      return { count: 1 }
    })
    findFirst.mockImplementation(async () => current)
    const migrated = await migrateApplicationSession('legacy-token')
    expect(migrated.token).not.toBe('legacy-token')
    expect(current.accessToken).toBe(hashSessionToken(migrated.token))
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'session-a',
      revoke: false,
      accessToken: 'legacy-token',
      absoluteExpiresAt: null,
    })
    expect(create).not.toHaveBeenCalled()
    updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(migrateApplicationSession('legacy-token')).rejects.toMatchObject({ status: 401 })
  })

  it('cannot reset the absolute age of a modern session through the migration endpoint', async () => {
    findMany.mockResolvedValue([row()])
    updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(migrateApplicationSession('original-credential')).rejects.toMatchObject({ status: 401 })
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      absoluteExpiresAt: null,
      accessToken: 'original-credential',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('checks erasure again after creating a session and revokes it if suppression won', async () => {
    blocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    await expect(createApplicationSession('user-a')).rejects.toMatchObject({ status: 401 })
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revoke: true } }))
  })

  it('refuses existing delegated sessions after their operator is absent from the static allowlist', async () => {
    findFirst.mockResolvedValueOnce(
      row({ id: 'delegated', discordID: 'target', actorDiscordID: 'former-developer', actorSessionID: 'parent' }),
    )
    expect(await validateApplicationSession('delegated')).toBeNull()
    expect(findFirst).toHaveBeenCalledOnce()
  })

  it('refuses creating a support session for an unlisted operator before storing credentials', async () => {
    await expect(
      createApplicationSession('target', {}, { actorDiscordID: 'former-developer', actorSessionID: 'parent' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(create).not.toHaveBeenCalled()
  })

  it('requires a live matching actor session for delegation', async () => {
    const delegated = row({
      id: 'delegated',
      discordID: 'target',
      actorDiscordID: '333650866747867137',
      actorSessionID: 'parent',
    })
    findFirst
      .mockResolvedValueOnce(delegated)
      .mockResolvedValueOnce(row({ id: 'parent', discordID: '333650866747867137', revoke: true }))
    expect(await validateApplicationSession('delegated')).toBeNull()
    findFirst
      .mockResolvedValueOnce(delegated)
      .mockResolvedValueOnce(row({ id: 'parent', discordID: '333650866747867137' }))
    expect(await validateApplicationSession('delegated')).toMatchObject({ actorDiscordID: '333650866747867137' })
  })
})

describe('browser transport and revocation', () => {
  it('uses a host-only secure HttpOnly cookie and rejects cross-origin or missing CSRF writes', async () => {
    findMany.mockResolvedValue([row()])
    const session = (await resolveApplicationSession('original-credential'))!
    expect(serializeAuthCookie('__Host-gmi_session', 'credential', session.expiresAt)).toContain(
      'Path=/; HttpOnly; SameSite=Lax; Secure',
    )
    expect(serializeAuthCookie('__Host-gmi_session', 'credential', session.expiresAt)).not.toContain('Domain=')
    expect(() => assertSessionRequest({ method: 'POST', headers: {} }, session)).toThrowError(
      expect.objectContaining({ code: 'csrf_invalid' }),
    )
    expect(() =>
      assertSessionRequest({ method: 'POST', headers: { 'x-csrf-token': 'é'.repeat(43) } }, session),
    ).toThrowError(expect.objectContaining({ code: 'csrf_invalid' }))
    expect(() =>
      assertSessionRequest(
        { method: 'POST', headers: { origin: 'https://evil.test', 'x-csrf-token': csrfTokenForSession(session) } },
        session,
      ),
    ).toThrowError(expect.objectContaining({ code: 'origin_forbidden' }))
    expect(() =>
      assertSessionRequest(
        {
          method: 'POST',
          headers: { origin: 'https://app.example.test', 'x-csrf-token': csrfTokenForSession(session) },
        },
        session,
      ),
    ).not.toThrow()
    const fromCookie = await resolveRequestSession({ headers: { cookie: '__Host-gmi_session=original-credential' } })
    expect(fromCookie?.id).toBe(session.id)
  })

  it('lists only safe metadata and identifies the current device without exposing bearer material', async () => {
    findMany.mockResolvedValue([row()])
    const sessions = await listApplicationSessions('user-a', 'session-a')
    expect(sessions[0]).toMatchObject({ id: 'session-a', isCurrent: true, os: 'Linux' })
    expect(JSON.stringify(sessions)).not.toContain('accessToken')
    expect(JSON.stringify(sessions)).not.toContain('sha256:')
  })

  it('revokes the exact session and its delegates, with durable fallback when pubsub is unavailable', async () => {
    findFirst.mockResolvedValue(row())
    findMany.mockResolvedValue([
      { id: 'session-a', discordID: 'user-a' },
      { id: 'delegated', discordID: 'target' },
    ])
    publish.mockRejectedValue(new Error('Redis unavailable'))
    expect(await revokeApplicationSession('session-a', 'user-a')).toBe(true)
    expect(updateMany).toHaveBeenCalledWith({
      where: { OR: [{ id: 'session-a' }, { actorSessionID: 'session-a' }] },
      data: { revoke: true },
    })
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('exchanges a short-lived socket ticket once and rechecks the session at consumption', async () => {
    findFirst.mockResolvedValue(row())
    findMany.mockResolvedValue([row()])
    const session = (await resolveApplicationSession('original-credential'))!
    const issued = await issueWebSocketTicket(session)
    expect(set).toHaveBeenCalledWith(expect.stringContaining('gmi:auth:ws-ticket:sha256:'), 'session-a', 'EX', 30)
    getdel.mockResolvedValueOnce('session-a')
    expect(await consumeWebSocketTicket(issued.ticket)).toMatchObject({ id: 'session-a' })
    expect(await consumeWebSocketTicket(issued.ticket)).toBeNull()
    getdel.mockResolvedValueOnce('session-a')
    findFirst.mockResolvedValueOnce(row({ revoke: true }))
    expect(await consumeWebSocketTicket(issued.ticket)).toBeNull()
  })
})
