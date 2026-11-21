import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Sessions from '@gmod/domain-auth/authSessions.js'

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  resolveToken: vi.fn(),
  migrate: vi.fn(),
  revoke: vi.fn(),
  list: vi.fn(),
  ticket: vi.fn(),
  create: vi.fn(),
  user: vi.fn(),
  cache: vi.fn(),
  panelFindMany: vi.fn(),
  panelFindFirst: vi.fn(),
  panelUpdateMany: vi.fn(),
  publish: vi.fn(),
}))
vi.mock('@gmod/domain-auth/authSessions.js', async (original) => ({
  ...(await original<typeof Sessions>()),
  resolveRequestSession: mocks.resolve,
  resolveApplicationSession: mocks.resolveToken,
  migrateApplicationSession: mocks.migrate,
  revokeApplicationSession: mocks.revoke,
  listApplicationSessions: mocks.list,
  issueWebSocketTicket: mocks.ticket,
  createApplicationSession: mocks.create,
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_user: { findFirst: mocks.user },
    gm_panelToken: {
      findMany: mocks.panelFindMany,
      findFirst: mocks.panelFindFirst,
      updateMany: mocks.panelUpdateMany,
    },
  },
}))
vi.mock('@gmod/infra-prisma/privacy.js', () => ({ isErasureBlocked: vi.fn().mockResolvedValue(false) }))
vi.mock('@gmod/infra-redis', () => ({ default: { get: mocks.cache, publish: mocks.publish } }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/config', () => ({
  ConfigAuth: { credentialEncryptionKey: 'test-auth-signing-key-that-is-long-enough' },
  ConfigDiscord: { clientSecret: 'test-client-secret' },
  ConfigServer: { websiteUrl: 'https://app.example.test', domain: 'https://api.example.test', dev: false },
}))

const { default: routes } = await import('../../../src/routes/v6/authRoutes.js')
const { csrfTokenForSession } = await import('@gmod/domain-auth/authSessions.js')
const actualSessions = await vi.importActual<typeof Sessions>('@gmod/domain-auth/authSessions.js')
const id = '6e83010e-56ab-4902-a709-717d2dc31d04'
const session = () => ({
  id,
  discordID: '123',
  tokenHash: 'sha256:test',
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 600_000),
  absoluteExpiresAt: new Date(Date.now() + 3_600_000),
})
let current = session()
function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6/auth', routes)
  instance.use(
    (
      error: Error & { status?: number; code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res.status(error.status || 500).json({ error: { code: error.code || 'internal_error', message: error.message } }),
  )
  return instance
}
const post = (path: string, body: unknown = {}) =>
  request(app())
    .post('/v6/auth' + path)
    .set('Origin', 'https://app.example.test')
    .set('X-CSRF-Token', csrfTokenForSession(current))
    .set('Cookie', '__Host-gmi_session=presented-credential')
    .send(body)

beforeEach(() => {
  vi.clearAllMocks()
  current = session()
  mocks.resolve.mockImplementation(async () => current)
  mocks.resolveToken.mockImplementation(async () => current)
  mocks.migrate.mockImplementation(async () => ({ token: 'new-cookie-credential', session: current }))
  mocks.revoke.mockResolvedValue(true)
  mocks.list.mockResolvedValue([{ id, isCurrent: true, expiresAt: current.expiresAt.toISOString() }])
  mocks.ticket.mockResolvedValue({ ticket: 'ephemeral-ticket', expiresAt: new Date(Date.now() + 30_000).toISOString() })
  mocks.user.mockResolvedValue({ id: '123', username: 'Alice', rank: 'user' })
  mocks.cache.mockResolvedValue(null)
})

describe('v6 browser authentication contract', () => {
  it('uses safe profile defaults for missing, malformed and partially cached decoration', async () => {
    mocks.user.mockResolvedValue({ id: '123', username: null, rank: null })
    for (const cached of ['null', '[]', '{broken', JSON.stringify({ globalName: 'Display', avatarURL: 42 })]) {
      mocks.cache.mockResolvedValueOnce(cached)
      const response = await request(app()).get('/v6/auth/session')
      expect(response.status).toBe(200)
      expect(response.body.user).toMatchObject({ id: '123', username: '', rank: 'user', avatarURL: '' })
    }
    mocks.cache.mockResolvedValueOnce(
      JSON.stringify({
        globalName: 'Alice Global',
        displayName: 'Alice Display',
        avatarURL: 'https://cdn.example.test/avatar.webp',
        discriminator: '0001',
      }),
    )
    const decorated = await request(app()).get('/v6/auth/session')
    expect(decorated.body.user).toMatchObject({
      globalName: 'Alice Global',
      displayName: 'Alice Display',
      discriminator: '0001',
    })
    mocks.user.mockResolvedValueOnce(null)
    expect((await request(app()).get('/v6/auth/session')).status).toBe(401)
  })

  it('rejects absent sessions before issuing a socket ticket or listing devices', async () => {
    mocks.resolve.mockResolvedValue(null)
    expect((await post('/ws-ticket')).status).toBe(401)
    expect((await request(app()).get('/v6/auth/sessions')).status).toBe(401)
    expect(mocks.ticket).not.toHaveBeenCalled()
  })

  it('requires JSON for legacy conversion and never changes cookies on rejected form input', async () => {
    const response = await request(app()).post('/v6/auth/legacy-session').type('form').send({ token: 'legacy' })
    expect(response.status).toBe(415)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(mocks.migrate).not.toHaveBeenCalled()
  })

  it('validates session IDs and clears only the current revoked device cookie', async () => {
    const remove = (sessionID: string) =>
      request(app())
        .delete('/v6/auth/sessions/' + sessionID)
        .set('X-CSRF-Token', csrfTokenForSession(current))
    expect((await remove('bad-id')).status).toBe(400)
    expect(mocks.revoke).not.toHaveBeenCalled()
    const other = await remove('d6801874-4d4b-4543-884c-80f379fe7299')
    expect(other.body).toEqual({ revoked: true })
    expect(other.headers['set-cookie']).toBeUndefined()
    const own = await remove(id)
    expect(own.status).toBe(200)
    expect(own.headers['set-cookie'][0]).toContain('__Host-gmi_session=;')
  })

  it('validates delegation targets and remaining actor lifetime before creating credentials', async () => {
    mocks.user.mockResolvedValue({ id: '123', rank: 'developer' })
    expect((await post('/impersonations', { discordID: '123' })).status).toBe(400)
    expect((await post('/impersonations', { discordID: 'arbitrary' })).status).toBe(400)
    mocks.user.mockResolvedValueOnce({ id: '123', rank: 'developer' }).mockResolvedValueOnce(null)
    expect((await post('/impersonations', { discordID: '456' })).status).toBe(404)
    current = { ...current, expiresAt: new Date(0) }
    expect((await post('/impersonations', { discordID: '456' })).status).toBe(401)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('returns the authoritative session, user rank and CSRF token without bearer material', async () => {
    const response = await request(app())
      .get('/v6/auth/session')
      .set('Cookie', '__Host-gmi_session=presented-credential')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      authenticated: true,
      user: { id: '123', username: 'Alice', rank: 'user' },
      session: { id },
      csrfToken: csrfTokenForSession(current),
    })
    expect(JSON.stringify(response.body)).not.toMatch(/presented-credential|sha256:test|accessToken/)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('keeps application authentication independent from an unavailable profile cache', async () => {
    mocks.cache.mockRejectedValueOnce(new Error('Redis unavailable'))
    expect((await request(app()).get('/v6/auth/session')).status).toBe(200)
    mocks.resolve.mockResolvedValueOnce(null)
    expect((await request(app()).get('/v6/auth/session')).status).toBe(401)
  })

  it('requires CSRF for cookie-authenticated writes and does not trust a foreign Origin', async () => {
    const missing = await request(app())
      .post('/v6/auth/logout')
      .set('Cookie', '__Host-gmi_session=presented-credential')
      .send({})
    expect(missing.status).toBe(403)
    expect(missing.body.error.code).toBe('csrf_invalid')
    const foreign = await post('/logout').set('Origin', 'https://evil.test')
    expect(foreign.status).toBe(403)
    expect(foreign.body.error.code).toBe('origin_forbidden')
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('revokes only the exact current session and is idempotent after it is absent', async () => {
    const response = await post('/logout')
    expect(response.body).toEqual({ revoked: true })
    expect(mocks.revoke).toHaveBeenCalledWith(id, '123')
    expect(response.headers['set-cookie'].join(' ')).toContain('Expires=Thu, 01 Jan 1970')
    mocks.resolve.mockResolvedValueOnce(null)
    expect((await post('/logout')).status).toBe(200)
  })

  it('migrates the owner legacy credential through JSON and emits only a cookie', async () => {
    const response = await post('/legacy-session', { token: 'legacy-local-token' })
    expect(response.status).toBe(200)
    expect(mocks.migrate).toHaveBeenCalledWith('legacy-local-token')
    expect(response.headers['set-cookie'][0]).toContain('new-cookie-credential')
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly; SameSite=Lax; Secure')
    expect(response.headers['set-cookie'][1]).toContain('__Host-gmi_actor_session=;')
    expect(JSON.stringify(response.body)).not.toContain('new-cookie-credential')
    expect((await post('/legacy-session', { token: 'legacy-local-token', discordID: 'other' })).status).toBe(400)
  })

  it('does not allow legacy migration to replace another signed-in account', async () => {
    mocks.resolveToken.mockResolvedValueOnce({ ...current, discordID: '456' })
    const response = await post('/legacy-session', { token: 'someone-else' })
    expect(response.status).toBe(409)
    expect(mocks.migrate).not.toHaveBeenCalled()
  })

  it('keeps expired or revoked legacy credentials rejected', async () => {
    mocks.resolveToken.mockResolvedValueOnce(null)
    expect((await post('/legacy-session', { token: 'expired-token' })).status).toBe(401)
    expect(mocks.migrate).not.toHaveBeenCalled()
  })

  it('lists safe device metadata and refuses session revocation outside the owner account', async () => {
    const listed = await request(app()).get('/v6/auth/sessions')
    expect(listed.body).toEqual({ sessions: [{ id, isCurrent: true, expiresAt: current.expiresAt.toISOString() }] })
    mocks.revoke.mockResolvedValueOnce(false)
    const response = await request(app())
      .delete('/v6/auth/sessions/' + id)
      .set('X-CSRF-Token', csrfTokenForSession(current))
    expect(response.status).toBe(404)
    expect(mocks.revoke).toHaveBeenCalledWith(id, '123')
  })

  it('issues a short-lived socket ticket from a valid cookie session', async () => {
    const response = await post('/ws-ticket')
    expect(response.status).toBe(200)
    expect(response.body.ticket).toBe('ephemeral-ticket')
    expect(mocks.ticket).toHaveBeenCalledWith(current)
  })

  it('requires developer access for a delegated session and never reuses a target bearer', async () => {
    expect((await post('/impersonations', { discordID: '456' })).status).toBe(403)
    mocks.user.mockImplementation(async ({ where }) => ({
      id: where.id,
      username: 'Name',
      rank: where.id === '123' ? 'developer' : 'user',
    }))
    const delegated = { ...current, id: 'delegated', discordID: '456', actorDiscordID: '123', actorSessionID: id }
    mocks.create.mockResolvedValueOnce({ token: 'delegated-cookie', session: delegated })
    const response = await post('/impersonations', { discordID: '456' })
    expect(response.status).toBe(200)
    expect(response.body.session).toMatchObject({ id: 'delegated', actorDiscordID: '123' })
    expect(JSON.stringify(response.body)).not.toMatch(/delegated-cookie|presented-credential/)
    expect(mocks.create).toHaveBeenCalledWith(
      '456',
      expect.any(Object),
      expect.objectContaining({ actorDiscordID: '123', actorSessionID: id }),
    )
  })

  it('keeps authentication management unavailable to delegated sessions', async () => {
    const delegated = { ...current, actorDiscordID: 'operator', actorSessionID: 'parent' }
    mocks.resolve.mockResolvedValue(delegated)
    expect((await request(app()).get('/v6/auth/sessions')).status).toBe(403)
    expect(
      (await post('/impersonations', { discordID: '456' }).set('X-CSRF-Token', csrfTokenForSession(delegated))).status,
    ).toBe(403)
  })
})

describe('delegation recovery with real cookie, session and CSRF validation', () => {
  const actorToken = 'actor-cookie-secret'
  const delegatedToken = 'delegated-cookie-secret'
  const otherActorToken = 'other-actor-cookie-secret'
  const actor = (): Sessions.AuthSession => ({ ...session(), id: 'actor-session' })
  const delegated = (): Sessions.AuthSession => ({
    ...session(),
    id: 'delegated-session',
    discordID: '456',
    actorDiscordID: '123',
    actorSessionID: 'actor-session',
  })
  function row(auth: Sessions.AuthSession, token: string) {
    return {
      ...auth,
      accessToken: actualSessions.hashSessionToken(token),
      tokenHash: actualSessions.hashSessionToken(token),
      creationDate: auth.createdAt,
      expirationDate: auth.expiresAt,
      revoke: false,
    }
  }
  type Row = ReturnType<typeof row>
  type Where = {
    id?: string
    discordID?: string
    actorSessionID?: string
    accessToken?: { in: string[] }
    revoke?: boolean
    expirationDate?: { gt: Date }
    OR?: Where[]
  }
  const rows = new Map<string, Row>()
  function matches(record: Row, where: Where): boolean {
    return (
      (!where.id || record.id === where.id) &&
      (!where.discordID || record.discordID === where.discordID) &&
      (!where.actorSessionID || record.actorSessionID === where.actorSessionID) &&
      (!where.accessToken || where.accessToken.in.includes(record.accessToken)) &&
      (where.revoke === undefined || record.revoke === where.revoke) &&
      (!where.expirationDate || record.expirationDate > where.expirationDate.gt) &&
      (!where.OR || where.OR.some((part) => matches(record, part)))
    )
  }
  const cookie = (primary = delegatedToken, actorCredential = actorToken) =>
    `__Host-gmi_session=${primary}; __Host-gmi_actor_session=${actorCredential}`
  const csrf = (record: Row) => csrfTokenForSession(record)
  const actorRow = () => rows.get('actor-session')!
  const delegatedRow = () => rows.get('delegated-session')!
  const recover = (cookies = cookie()) =>
    request(app()).post('/v6/auth/impersonations/end').set('Origin', 'https://app.example.test').set('Cookie', cookies)

  beforeEach(() => {
    rows.clear()
    rows.set('actor-session', row(actor(), actorToken))
    rows.set('delegated-session', row(delegated(), delegatedToken))
    mocks.resolve.mockImplementation(actualSessions.resolveRequestSession)
    mocks.resolveToken.mockImplementation(actualSessions.resolveApplicationSession)
    mocks.revoke.mockImplementation(actualSessions.revokeApplicationSession)
    mocks.panelFindMany.mockImplementation(async ({ where }: { where: Where }) =>
      [...rows.values()].filter((record) => matches(record, where)),
    )
    mocks.panelFindFirst.mockImplementation(async ({ where }: { where: Where }) =>
      [...rows.values()].find((record) => matches(record, where)),
    )
    mocks.panelUpdateMany.mockImplementation(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const selected = [...rows.values()].filter((record) => matches(record, where))
      for (const record of selected) Object.assign(record, data)
      return { count: selected.length }
    })
    mocks.publish.mockResolvedValue(1)
  })

  it('offers only an actor CSRF recovery hint after the delegated session expires, without setting cookies', async () => {
    delegatedRow().expirationDate = new Date(Date.now() - 1)
    const response = await request(app())
      .get('/v6/auth/session')
      .set('Origin', 'https://app.example.test')
      .set('Cookie', cookie())
    expect(response.status).toBe(401)
    expect(response.body).toEqual({
      error: { code: 'actor_session_available', message: 'Return to your account.' },
      csrfToken: csrf(actorRow()),
    })
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.user).not.toHaveBeenCalled()
    expect(actorRow().revoke).toBe(false)
  })

  it('rejects a foreign origin before revealing an actor recovery hint', async () => {
    delegatedRow().expirationDate = new Date(Date.now() - 1)
    const response = await request(app())
      .get('/v6/auth/session')
      .set('Origin', 'https://evil.test')
      .set('Cookie', cookie())
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('origin_forbidden')
    expect(response.body.csrfToken).toBeUndefined()
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('recovers an expired delegation only with the actor CSRF token and preserves the parent session', async () => {
    delegatedRow().expirationDate = new Date(Date.now() - 1)
    expect((await recover().set('X-CSRF-Token', csrf(delegatedRow())).send({})).status).toBe(403)
    const response = await recover().set('X-CSRF-Token', csrf(actorRow())).send({})
    expect(response.status).toBe(200)
    expect(response.body.session.id).toBe('actor-session')
    expect(response.body.user.id).toBe('123')
    expect(response.headers['set-cookie'][0]).toContain(`__Host-gmi_session=${actorToken};`)
    expect(response.headers['set-cookie'][1]).toContain('__Host-gmi_actor_session=;')
    expect(actorRow().revoke).toBe(false)
  })

  it('recovers a missing primary cookie but does not let Authorization bypass the actor CSRF requirement', async () => {
    const cookies = `__Host-gmi_actor_session=${actorToken}`
    const missingCsrf = await recover(cookies).set('Authorization', 'Bearer invalid-credential').send({})
    expect(missingCsrf.status).toBe(403)
    expect(missingCsrf.body.error.code).toBe('csrf_invalid')
    expect(missingCsrf.headers['set-cookie']).toBeUndefined()
    expect((await recover(cookies).set('X-CSRF-Token', csrf(actorRow())).send({})).status).toBe(200)
  })

  it('ends a still-valid delegation using its CSRF token and revokes only that delegation', async () => {
    expect((await recover().set('X-CSRF-Token', csrf(actorRow())).send({})).status).toBe(403)
    const response = await recover().set('X-CSRF-Token', csrf(delegatedRow())).send({})
    expect(response.status).toBe(200)
    expect(delegatedRow().revoke).toBe(true)
    expect(actorRow().revoke).toBe(false)
    expect(mocks.publish).toHaveBeenCalledWith(
      'gmi:auth:session-revoked',
      JSON.stringify({ sessionID: 'delegated-session', discordID: '456' }),
    )
  })

  it('refuses to replace a valid normal primary session using a stale actor cookie', async () => {
    const response = await recover(cookie(actorToken)).set('X-CSRF-Token', csrf(actorRow())).send({})
    expect(response.status).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(actorRow().revoke).toBe(false)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('refuses a delegation linked to another valid parent without changing either session', async () => {
    const otherActor = row({ ...actor(), id: 'other-parent', discordID: '789' }, otherActorToken)
    rows.set(otherActor.id, otherActor)
    delegatedRow().actorSessionID = otherActor.id
    delegatedRow().actorDiscordID = otherActor.discordID
    const response = await recover().set('X-CSRF-Token', csrf(delegatedRow())).send({})
    expect(response.status).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect([...rows.values()].every((record) => !record.revoke)).toBe(true)
  })

  it('does not offer or restore a revoked parent even when the delegated cookie has not expired', async () => {
    actorRow().revoke = true
    const hint = await request(app()).get('/v6/auth/session').set('Cookie', cookie())
    expect(hint.status).toBe(401)
    expect(hint.body.error.code).toBe('unauthorized')
    expect(hint.body.csrfToken).toBeUndefined()
    const response = await recover().set('X-CSRF-Token', csrf(actorRow())).send({})
    expect(response.status).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('does not accept another delegated credential as an actor recovery cookie', async () => {
    const cookies = `__Host-gmi_actor_session=${delegatedToken}`
    const response = await request(app()).get('/v6/auth/session').set('Cookie', cookies)
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('unauthorized')
    expect(response.body.csrfToken).toBeUndefined()
    expect((await recover(cookies).set('X-CSRF-Token', csrf(delegatedRow())).send({})).status).toBe(401)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('logs out both a valid delegation and its matching parent before clearing their cookies', async () => {
    const rejected = await request(app())
      .post('/v6/auth/logout')
      .set('Cookie', cookie())
      .set('X-CSRF-Token', csrf(actorRow()))
      .send({})
    expect(rejected.status).toBe(403)
    expect(actorRow().revoke).toBe(false)
    expect(delegatedRow().revoke).toBe(false)
    const response = await request(app())
      .post('/v6/auth/logout')
      .set('Cookie', cookie())
      .set('X-CSRF-Token', csrf(delegatedRow()))
      .send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ revoked: true })
    expect(actorRow().revoke).toBe(true)
    expect(delegatedRow().revoke).toBe(true)
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('__Host-gmi_session=;'),
      expect.stringContaining('__Host-gmi_actor_session=;'),
    ])
  })

  it('requires the actor CSRF token to log out after delegation expiry, including with an invalid Bearer header', async () => {
    delegatedRow().expirationDate = new Date(Date.now() - 1)
    const rejected = await request(app())
      .post('/v6/auth/logout')
      .set('Cookie', cookie())
      .set('Authorization', 'Bearer invalid-credential')
      .send({})
    expect(rejected.status).toBe(403)
    expect(actorRow().revoke).toBe(false)
    expect(rejected.headers['set-cookie']).toBeUndefined()
    const response = await request(app())
      .post('/v6/auth/logout')
      .set('Cookie', cookie())
      .set('X-CSRF-Token', csrf(actorRow()))
      .send({})
    expect(response.status).toBe(200)
    expect(actorRow().revoke).toBe(true)
    expect(delegatedRow().revoke).toBe(true)
  })

  it('does not revoke an unrelated valid actor cookie during delegated logout', async () => {
    const otherActor = row({ ...actor(), id: 'other-parent', discordID: '789' }, otherActorToken)
    rows.set(otherActor.id, otherActor)
    const response = await request(app())
      .post('/v6/auth/logout')
      .set('Cookie', cookie(delegatedToken, otherActorToken))
      .set('X-CSRF-Token', csrf(delegatedRow()))
      .send({})
    expect(response.status).toBe(200)
    expect(delegatedRow().revoke).toBe(true)
    expect(actorRow().revoke).toBe(false)
    expect(otherActor.revoke).toBe(false)
  })
})
