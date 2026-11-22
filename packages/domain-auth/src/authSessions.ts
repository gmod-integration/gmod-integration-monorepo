import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { ConfigAuth, ConfigDiscord, ConfigServer } from '@gmod/config'
import { isDeveloper } from '@gmod/config/developers.js'
import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/infra-prisma/privacy.js'
import redis from '@gmod/infra-redis'

export const AUTH_SESSION_REVOCATION_CHANNEL = 'gmi:auth:session-revoked'
export type SessionRequest = { headers: Record<string, string | string[] | undefined>; method?: string }
export type AuthSession = {
  id: string
  discordID: string
  actorDiscordID?: string
  actorSessionID?: string
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
  absoluteExpiresAt: Date
  tokenHash: string
}
export type SessionMetadata = { os?: unknown; browser?: unknown; ip?: unknown; country?: unknown }
type SessionRow = {
  id: string
  discordID: string
  accessToken: string
  revoke: boolean
  creationDate: Date
  createdAt: Date
  expirationDate: Date
  absoluteExpiresAt?: Date | null
  lastSeenAt?: Date | null
  actorDiscordID?: string | null
  actorSessionID?: string | null
}

export class AuthSessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthSessionError'
  }
}

const unauthorized = () => new AuthSessionError(401, 'unauthorized', 'A valid session is required.')
const key = () => ConfigAuth.credentialEncryptionKey || ConfigDiscord.clientSecret
export const hashSessionToken = (token: string) => `sha256:${createHash('sha256').update(token).digest('hex')}`
const opaqueToken = () => randomBytes(32).toString('base64url')
const header = (req: SessionRequest, name: string) => {
  const value = req.headers[name]
  return typeof value === 'string' ? value : undefined
}
const cookieSecure = () => new URL(ConfigServer.domain).protocol === 'https:'
export const sessionCookieName = () => (cookieSecure() ? '__Host-gmi_session' : 'gmi_session')
export const actorCookieName = () => (cookieSecure() ? '__Host-gmi_actor_session' : 'gmi_actor_session')
export const oauthCookieName = () => (cookieSecure() ? '__Host-gmi_oauth' : 'gmi_oauth')

export function readCookie(req: SessionRequest, name: string): string | undefined {
  const parts = (header(req, 'cookie') || '').split(';')
  const matches = parts.map((part) => part.trim()).filter((part) => part.startsWith(name + '='))
  if (matches.length !== 1) return undefined
  try {
    return decodeURIComponent(matches[0].slice(name.length + 1))
  } catch {
    return undefined
  }
}

export function readSessionCredential(req: SessionRequest): string | undefined {
  const authorization = header(req, 'authorization')
  if (authorization) return authorization.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i)?.[1]
  return readCookie(req, sessionCookieName())
}

export function serializeAuthCookie(name: string, value: string, expires: Date): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${cookieSecure() ? '; Secure' : ''}; Expires=${expires.toUTCString()}`
}

export function csrfTokenForSession(session: AuthSession): string {
  return createHmac('sha256', key()).update(`gmi:csrf:v1:${session.id}:${session.tokenHash}`).digest('base64url')
}

export function assertTrustedOrigin(req: SessionRequest): void {
  const origin = header(req, 'origin')
  if (!origin) return
  const allowed = [ConfigServer.websiteUrl, ConfigServer.domain].map((value) => new URL(value).origin)
  if (allowed.includes(origin)) return
  try {
    const parsed = new URL(origin)
    if (
      ConfigServer.dev &&
      ['http:', 'https:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.origin === origin
    )
      return
  } catch {
    /* An invalid origin is rejected below. */
  }
  throw new AuthSessionError(403, 'origin_forbidden', 'This origin is not allowed.')
}

export function assertSessionRequest(req: SessionRequest, session: AuthSession): void {
  assertTrustedOrigin(req)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET') || header(req, 'authorization')) return
  const actual = header(req, 'x-csrf-token') || ''
  const expected = csrfTokenForSession(session)
  if (!/^[A-Za-z0-9_-]{43}$/.test(actual) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
    throw new AuthSessionError(403, 'csrf_invalid', 'Reload the session before trying again.')
}

function asSession(row: SessionRow): AuthSession | null {
  const now = Date.now()
  const absolute = new Date(row.absoluteExpiresAt || row.expirationDate)
  const expiry = new Date(Math.min(new Date(row.expirationDate).getTime(), absolute.getTime()))
  if (
    row.revoke ||
    !Number.isFinite(expiry.getTime()) ||
    expiry.getTime() <= now ||
    !!row.actorDiscordID !== !!row.actorSessionID
  )
    return null
  return {
    id: row.id,
    discordID: row.discordID,
    ...(row.actorDiscordID ? { actorDiscordID: row.actorDiscordID } : {}),
    ...(row.actorSessionID ? { actorSessionID: row.actorSessionID } : {}),
    createdAt: new Date(row.creationDate || row.createdAt),
    lastSeenAt: new Date(row.lastSeenAt || row.creationDate || row.createdAt),
    expiresAt: expiry,
    absoluteExpiresAt: absolute,
    tokenHash: row.accessToken.startsWith('sha256:') ? row.accessToken : hashSessionToken(row.accessToken),
  }
}

async function eligible(row: SessionRow | null): Promise<AuthSession | null> {
  if (!row) return null
  const session = asSession(row)
  if (
    !session ||
    (await isErasureBlocked(session.discordID)) ||
    (session.actorDiscordID && (await isErasureBlocked(session.actorDiscordID)))
  )
    return null
  let expiresAt = session.expiresAt
  if (session.actorSessionID) {
    if (!isDeveloper(session.actorDiscordID)) return null
    const actor = await prisma.gm_panelToken.findFirst({ where: { id: session.actorSessionID, revoke: false } })
    const parent = actor ? asSession(actor) : null
    if (!parent || parent.actorDiscordID || parent.discordID !== session.actorDiscordID) return null
    expiresAt = new Date(Math.min(expiresAt.getTime(), parent.expiresAt.getTime()))
  }
  // Privacy and parent lookups may span the deadline; never return the earlier clock decision.
  if (expiresAt.getTime() <= Date.now() || session.absoluteExpiresAt.getTime() <= Date.now()) return null
  return { ...session, expiresAt }
}

/** The raw token is never returned in a session DTO or persisted for new sessions. */
export async function resolveApplicationSession(
  token: string,
  options: { touch?: boolean } = {},
): Promise<AuthSession | null> {
  // A database hash is not a valid bearer credential, even if the database is disclosed.
  if (!/^[A-Za-z0-9._~+/-]{1,255}={0,2}$/.test(token)) return null
  const rows = await prisma.gm_panelToken.findMany({
    where: { accessToken: { in: [token, hashSessionToken(token)] }, revoke: false, expirationDate: { gt: new Date() } },
    take: 2,
  })
  if (rows.length !== 1) return null
  let session = await eligible(rows[0])
  if (!session) return null
  if (
    options.touch !== false &&
    rows[0].absoluteExpiresAt &&
    !session.actorSessionID &&
    Date.now() - session.lastSeenAt.getTime() > 60_000
  ) {
    const now = new Date()
    const expiresAt = new Date(
      Math.min(session.absoluteExpiresAt.getTime(), now.getTime() + ConfigAuth.sessionIdleTtlSeconds * 1000),
    )
    const result = await prisma.gm_panelToken.updateMany({
      where: { id: session.id, accessToken: rows[0].accessToken, revoke: false, expirationDate: { gt: now } },
      data: { lastSeenAt: now, expirationDate: expiresAt },
    })
    if (!result.count) return null
    session = { ...session, lastSeenAt: now, expiresAt }
  }
  if (await isErasureBlocked(session.discordID)) return null
  return session.expiresAt.getTime() > Date.now() && session.absoluteExpiresAt.getTime() > Date.now() ? session : null
}

export async function resolveRequestSession(
  req: SessionRequest,
  options: { touch?: boolean } = {},
): Promise<AuthSession | null> {
  const token = readSessionCredential(req)
  return token ? resolveApplicationSession(token, options) : null
}

export async function validateApplicationSession(sessionID: string): Promise<AuthSession | null> {
  return eligible(await prisma.gm_panelToken.findFirst({ where: { id: sessionID, revoke: false } }))
}

export async function createApplicationSession(
  discordID: string,
  metadata: SessionMetadata = {},
  options: { actorDiscordID?: string; actorSessionID?: string; ttlSeconds?: number } = {},
): Promise<{ token: string; session: AuthSession }> {
  if (
    !!options.actorDiscordID !== !!options.actorSessionID ||
    (options.actorDiscordID && !isDeveloper(options.actorDiscordID))
  )
    throw new AuthSessionError(403, 'forbidden', 'Developer access is required for support.')
  if (
    (await isErasureBlocked(discordID)) ||
    (options.actorDiscordID && (await isErasureBlocked(options.actorDiscordID)))
  )
    throw new AuthSessionError(409, 'personal_data_erasure_blocked', 'Account erasure is in progress.')
  const now = new Date()
  const absoluteExpiresAt = new Date(
    now.getTime() +
      Math.min(options.ttlSeconds || ConfigAuth.sessionAbsoluteTtlSeconds, ConfigAuth.sessionAbsoluteTtlSeconds) * 1000,
  )
  const expiresAt = new Date(
    Math.min(absoluteExpiresAt.getTime(), now.getTime() + ConfigAuth.sessionIdleTtlSeconds * 1000),
  )
  const token = opaqueToken()
  const field = (value: unknown) => (typeof value === 'string' ? value.slice(0, 255) : null)
  const row = await prisma.gm_panelToken.create({
    data: {
      id: randomUUID(),
      discordID,
      accessToken: hashSessionToken(token),
      creationDate: now,
      expirationDate: expiresAt,
      absoluteExpiresAt,
      lastSeenAt: now,
      actorDiscordID: options.actorDiscordID,
      actorSessionID: options.actorSessionID,
      os: field(metadata.os),
      browser: field(metadata.browser),
      ip: field(metadata.ip),
      country: field(metadata.country),
    },
  })
  const session = await eligible(row)
  if (!session) {
    await prisma.gm_panelToken.updateMany({ where: { id: row.id }, data: { revoke: true } })
    throw unauthorized()
  }
  return { token, session }
}

/** Explicit owner exchange, with a conditional write so revoked/expired sessions never migrate. */
export async function migrateApplicationSession(token: string): Promise<{ token: string; session: AuthSession }> {
  const existing = await resolveApplicationSession(token, { touch: false })
  if (!existing || existing.actorDiscordID) throw unauthorized()
  const fresh = opaqueToken()
  const now = new Date()
  const absoluteExpiresAt = new Date(now.getTime() + ConfigAuth.sessionAbsoluteTtlSeconds * 1000)
  const expiresAt = new Date(
    Math.min(absoluteExpiresAt.getTime(), now.getTime() + ConfigAuth.sessionIdleTtlSeconds * 1000),
  )
  const updated = await prisma.gm_panelToken.updateMany({
    where: { id: existing.id, accessToken: token, absoluteExpiresAt: null, revoke: false, expirationDate: { gt: now } },
    data: { accessToken: hashSessionToken(fresh), absoluteExpiresAt, lastSeenAt: now, expirationDate: expiresAt },
  })
  if (!updated.count) throw unauthorized()
  const session = await validateApplicationSession(existing.id)
  if (!session) throw unauthorized()
  return { token: fresh, session }
}

export async function listApplicationSessions(discordID: string, currentSessionID?: string) {
  const rows = await prisma.gm_panelToken.findMany({
    where: { discordID, revoke: false, expirationDate: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.flatMap((row) => {
    const session = asSession(row)
    return session
      ? [
          {
            id: session.id,
            createdAt: session.createdAt.toISOString(),
            lastSeenAt: session.lastSeenAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
            absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
            os: row.os,
            ip: row.ip,
            browser: row.browser,
            country: row.country,
            isCurrent: session.id === currentSessionID,
            ...(session.actorDiscordID ? { actorDiscordID: session.actorDiscordID } : {}),
          },
        ]
      : []
  })
}

export async function revokeApplicationSession(sessionID: string, discordID?: string): Promise<boolean> {
  const row = await prisma.gm_panelToken.findFirst({ where: { id: sessionID, ...(discordID ? { discordID } : {}) } })
  if (!row) return false
  const affected = await prisma.gm_panelToken.findMany({
    where: { OR: [{ id: sessionID }, { actorSessionID: sessionID }] },
    select: { id: true, discordID: true },
  })
  await prisma.gm_panelToken.updateMany({
    where: { OR: [{ id: sessionID }, { actorSessionID: sessionID }] },
    data: { revoke: true },
  })
  for (const session of affected) {
    try {
      await redis.publish(
        AUTH_SESSION_REVOCATION_CHANNEL,
        JSON.stringify({ sessionID: session.id, discordID: session.discordID }),
      )
    } catch {
      /* Durable revocation remains authoritative; gateways also revalidate sessions. */
    }
  }
  return true
}

export async function issueWebSocketTicket(session: AuthSession): Promise<{ ticket: string; expiresAt: string }> {
  if (!(await validateApplicationSession(session.id))) throw unauthorized()
  const ticket = opaqueToken()
  const ttl = Math.min(ConfigAuth.wsTicketTtlSeconds, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
  if (ttl < 1) throw unauthorized()
  await redis.set(`gmi:auth:ws-ticket:${hashSessionToken(ticket)}`, session.id, 'EX', ttl)
  return { ticket, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }
}

export async function consumeWebSocketTicket(ticket: string): Promise<AuthSession | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return null
  const id = await redis.getdel(`gmi:auth:ws-ticket:${hashSessionToken(ticket)}`)
  return id ? validateApplicationSession(id) : null
}
