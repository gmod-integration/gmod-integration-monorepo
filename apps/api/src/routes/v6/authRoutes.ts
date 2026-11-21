import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'
import {
  actorCookieName,
  AuthSessionError,
  assertSessionRequest,
  assertTrustedOrigin,
  createApplicationSession,
  csrfTokenForSession,
  issueWebSocketTicket,
  listApplicationSessions,
  migrateApplicationSession,
  readCookie,
  readSessionCredential,
  resolveApplicationSession,
  resolveRequestSession,
  revokeApplicationSession,
  serializeAuthCookie,
  sessionCookieName,
  type AuthSession,
} from '@gmod/domain-auth/authSessions.js'
import { gmLog } from '@gmod/shared/logger.js'
import asyncHandler from '../../middleware/asyncHandler.js'

const router = express.Router()
const denied = () => new AuthSessionError(401, 'unauthorized', 'A valid session is required.')
const metadata = (req: Request) => ({
  os: req.useragent?.os,
  browser: req.useragent?.browser,
  ip: req.ip,
  country: req.headers['cf-ipcountry'],
})
const setSession = (res: Response, token: string, session: AuthSession) =>
  res.append('Set-Cookie', serializeAuthCookie(sessionCookieName(), token, session.absoluteExpiresAt))
const clearCookie = (res: Response, name: string) =>
  res.append('Set-Cookie', serializeAuthCookie(name, '', new Date(0)))

async function resolveActorCookie(req: Request) {
  const token = readCookie(req, actorCookieName())
  const session = token ? await resolveApplicationSession(token, { touch: false }) : null
  return token && session && !session.actorSessionID && !session.actorDiscordID ? { token, session } : null
}

function assertCookieSessionRequest(req: Request, session: AuthSession) {
  // This proof is always cookie-based, even if an unrelated Authorization header is supplied.
  assertSessionRequest({ method: req.method, headers: { ...req.headers, authorization: undefined } }, session)
}

function matchesActor(delegated: AuthSession, actor: AuthSession) {
  return delegated.actorSessionID === actor.id && delegated.actorDiscordID === actor.discordID
}

async function snapshot(session: AuthSession) {
  const user = await prisma.gm_user.findFirst({ where: { id: session.discordID } })
  if (!user) throw denied()
  let profile: Record<string, unknown> = {}
  try {
    const cached = await redis.get(`gmi:auth:profile:${session.discordID}`)
    if (cached) {
      const value: unknown = JSON.parse(cached)
      if (value && typeof value === 'object' && !Array.isArray(value)) profile = value as Record<string, unknown>
    }
  } catch {
    /* A profile-cache outage must not invalidate an application session. */
  }
  const text = (key: string, fallback = '') => (typeof profile[key] === 'string' ? (profile[key] as string) : fallback)
  return {
    authenticated: true,
    user: {
      id: session.discordID,
      username: user.username || '',
      rank: user.rank || 'user',
      globalName: text('globalName', user.username || ''),
      displayName: text('displayName', user.username || ''),
      avatarURL: text('avatarURL'),
      displayAvatarURL: text('avatarURL'),
      discriminator: text('discriminator'),
    },
    session: {
      id: session.id,
      expiresAt: session.expiresAt.toISOString(),
      absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      ...(session.actorDiscordID ? { actorDiscordID: session.actorDiscordID } : {}),
    },
    csrfToken: csrfTokenForSession(session),
  }
}

async function requireSession(req: Request, _res: Response, next: NextFunction) {
  const session = await resolveRequestSession(req)
  if (!session) throw denied()
  assertSessionRequest(req, session)
  req.authSession = session
  next()
}

function ownSession(session: AuthSession) {
  if (session.actorDiscordID)
    throw new AuthSessionError(403, 'impersonation_forbidden', 'This operation requires your own account session.')
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

router.post(
  '/legacy-session',
  asyncHandler(async (req, res) => {
    assertTrustedOrigin(req)
    if (!req.is('application/json')) throw new AuthSessionError(415, 'invalid_request', 'Use a JSON request body.')
    const input = z
      .object({ token: z.string().min(1).max(255) })
      .strict()
      .safeParse(req.body)
    if (!input.success) throw new AuthSessionError(400, 'invalid_request', 'A valid legacy session is required.')
    const current = await resolveRequestSession(req, { touch: false })
    const legacy = await resolveApplicationSession(input.data.token, { touch: false })
    if (!legacy) throw denied()
    if (current && current.discordID !== legacy.discordID)
      throw new AuthSessionError(409, 'session_conflict', 'A different account is already signed in.')
    const migrated = await migrateApplicationSession(input.data.token)
    setSession(res, migrated.token, migrated.session)
    clearCookie(res, actorCookieName())
    return res.json(await snapshot(migrated.session))
  }),
)

router.get(
  '/session',
  asyncHandler(async (req, res) => {
    assertTrustedOrigin(req)
    const session = await resolveRequestSession(req)
    if (!session) {
      const actor = await resolveActorCookie(req)
      if (!actor) throw denied()
      return res.status(401).json({
        error: { code: 'actor_session_available', message: 'Return to your account.' },
        csrfToken: csrfTokenForSession(actor.session),
      })
    }
    assertSessionRequest(req, session)
    // Reads must not overwrite a newer login/delegation cookie when responses arrive out of order.
    // The cookie lives until the absolute deadline; the database enforces sliding inactivity.
    return res.json(await snapshot(session))
  }),
)

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    assertTrustedOrigin(req)
    const session = await resolveRequestSession(req, { touch: false })
    const actor = await resolveActorCookie(req)
    if (session) {
      assertSessionRequest(req, session)
      await revokeApplicationSession(session.id, session.discordID)
      if (actor && matchesActor(session, actor.session))
        await revokeApplicationSession(actor.session.id, actor.session.discordID)
    } else if (actor) {
      assertCookieSessionRequest(req, actor.session)
      await revokeApplicationSession(actor.session.id, actor.session.discordID)
    }
    clearCookie(res, sessionCookieName())
    clearCookie(res, actorCookieName())
    return res.json({ revoked: true })
  }),
)

router.get(
  '/sessions',
  asyncHandler(requireSession),
  asyncHandler(async (req, res) => {
    ownSession(req.authSession!)
    return res.json({ sessions: await listApplicationSessions(req.authSession!.discordID, req.authSession!.id) })
  }),
)

router.delete(
  '/sessions/:id',
  asyncHandler(requireSession),
  asyncHandler(async (req, res) => {
    ownSession(req.authSession!)
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw new AuthSessionError(400, 'invalid_request', 'A session ID is required.')
    if (!(await revokeApplicationSession(id.data, req.authSession!.discordID)))
      throw new AuthSessionError(404, 'not_found', 'This session was not found.')
    if (id.data === req.authSession!.id) clearCookie(res, sessionCookieName())
    return res.json({ revoked: true })
  }),
)

router.post(
  '/ws-ticket',
  asyncHandler(requireSession),
  asyncHandler(async (req, res) => res.json(await issueWebSocketTicket(req.authSession!))),
)

router.post(
  '/impersonations',
  asyncHandler(requireSession),
  asyncHandler(async (req, res) => {
    const actor = req.authSession!
    ownSession(actor)
    const operator = await prisma.gm_user.findFirst({ where: { id: actor.discordID } })
    if (operator?.rank !== 'developer') throw new AuthSessionError(403, 'forbidden', 'Developer access is required.')
    const input = z
      .object({ discordID: z.string().regex(/^\d{1,255}$/) })
      .strict()
      .safeParse(req.body)
    if (!input.success || input.data.discordID === actor.discordID)
      throw new AuthSessionError(400, 'invalid_request', 'Select a different account.')
    const target = await prisma.gm_user.findFirst({ where: { id: input.data.discordID } })
    if (!target) throw new AuthSessionError(404, 'not_found', 'This account was not found.')
    const token = readSessionCredential(req)!
    const ttlSeconds = Math.min(900, Math.floor((actor.expiresAt.getTime() - Date.now()) / 1000))
    if (ttlSeconds < 1) throw denied()
    const delegated = await createApplicationSession(target.id, metadata(req), {
      actorDiscordID: actor.discordID,
      actorSessionID: actor.id,
      ttlSeconds,
    })
    res.append('Set-Cookie', serializeAuthCookie(actorCookieName(), token, actor.absoluteExpiresAt))
    setSession(res, delegated.token, delegated.session)
    gmLog(
      'auth',
      JSON.stringify({
        action: 'impersonation_started',
        actor: actor.discordID,
        subject: target.id,
        sessionID: delegated.session.id,
      }),
    )
    return res.json(await snapshot(delegated.session))
  }),
)

router.post(
  '/impersonations/end',
  asyncHandler(async (req, res) => {
    assertTrustedOrigin(req)
    const actor = await resolveActorCookie(req)
    if (!actor) throw denied()
    const delegated = await resolveRequestSession(req, { touch: false })
    if (delegated && !matchesActor(delegated, actor.session)) throw denied()
    assertCookieSessionRequest(req, delegated || actor.session)
    if (delegated) await revokeApplicationSession(delegated.id, delegated.discordID)
    setSession(res, actor.token, actor.session)
    clearCookie(res, actorCookieName())
    gmLog(
      'auth',
      JSON.stringify({
        action: delegated ? 'impersonation_ended' : 'impersonation_recovered',
        actor: actor.session.discordID,
        ...(delegated ? { subject: delegated.discordID, sessionID: delegated.id } : {}),
      }),
    )
    return res.json(await snapshot(actor.session))
  }),
)

export default router
