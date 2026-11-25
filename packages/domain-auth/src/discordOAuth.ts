import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ConfigAuth, ConfigDiscord } from '@gmod/config'
import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'
import { isErasureBlocked, privacySubject } from '@gmod/infra-prisma/privacy.js'
import { gmLog } from '@gmod/shared/logger.js'

const TokenResponseSchema = z.object({
  access_token: z.string().min(1).max(16_384),
  refresh_token: z.string().min(1).max(16_384),
  token_type: z
    .string()
    .regex(/^bearer$/i)
    .default('Bearer'),
  expires_in: z.number().int().positive().max(31_536_000),
  scope: z.string().optional(),
})
export type DiscordTokenResponse = z.infer<typeof TokenResponseSchema>
export type DiscordOAuthErrorCode = 'provider_unavailable' | 'grant_rejected' | 'privacy_blocked'
export class DiscordOAuthError extends Error {
  readonly status: 401 | 403 | 503
  constructor(
    readonly code: DiscordOAuthErrorCode,
    readonly retryAfter?: number,
  ) {
    super(
      code === 'grant_rejected'
        ? 'Reconnect Discord to continue.'
        : 'Discord authorization is temporarily unavailable.',
    )
    this.name = 'DiscordOAuthError'
    this.status = code === 'grant_rejected' ? 401 : code === 'privacy_blocked' ? 403 : 503
  }
}

const TOKEN_URL = 'https://discord.com/api/oauth2/token'
const REQUEST_TIMEOUT_MS = 10_000
const REFRESH_SKEW_MS = 60_000
const LOCK_TTL_MS = 20_000
const LOCK_WAIT_MS = 3_000
const LOCK_RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
const inFlight = new Map<string, Promise<DiscordTokenResponse | null>>()
const lockKey = (id: string) => `auth:discord:refresh:${privacySubject('discord', id)}`
const retryKey = (id: string, version: number) => `auth:discord:retry:${privacySubject('discord', id)}:${version}`
type CredentialRow = {
  discordID: string
  accessToken: string
  refreshToken: string
  expirationDate: Date
  version: number
}

function encryptionKey() {
  const material = ConfigAuth.credentialEncryptionKey || ConfigDiscord.clientSecret
  if (!material) throw new DiscordOAuthError('provider_unavailable')
  return Buffer.from(hkdfSync('sha256', material, 'gmod-integration:auth', 'discord-credentials:v1', 32))
}

function encrypt(value: string, discordID: string, kind: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(`${discordID}:${kind}`))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`
}

function decrypt(value: string, discordID: string, kind: string) {
  // Existing valid grants remain usable and are encrypted on their next rotation.
  if (!value.startsWith('enc:')) return value
  try {
    if (!value.startsWith('enc:v1:')) throw new Error('Unsupported credential version')
    const packed = Buffer.from(value.slice(7), 'base64url')
    if (packed.length <= 28) throw new Error('Invalid credential')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12))
    decipher.setAAD(Buffer.from(`${discordID}:${kind}`))
    decipher.setAuthTag(packed.subarray(12, 28))
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    throw new DiscordOAuthError('provider_unavailable')
  }
}

async function assertAllowed(discordID: string) {
  if (await isErasureBlocked(discordID)) throw new DiscordOAuthError('privacy_blocked')
}

async function invalidateGuildPermissions(discordID: string) {
  try {
    await redis.del(`user:${discordID}:guilds`)
  } catch {
    // Permission readers also require a current grant; Redis failure cannot revive a rejected one.
  }
}

function retryDelay(response: Response, body: unknown) {
  const header = response.headers?.get('retry-after')
  const input = header || (body as { retry_after?: unknown } | null)?.retry_after
  const seconds =
    typeof input === 'string' && !Number.isFinite(Number(input))
      ? (Date.parse(input) - Date.now()) / 1_000
      : Number(input)
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.ceil(seconds)) : undefined
}

async function tokenRequest(parameters: Record<string, string>): Promise<DiscordTokenResponse> {
  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ConfigDiscord.clientID,
        client_secret: ConfigDiscord.clientSecret,
        ...parameters,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const code = body && typeof body === 'object' && 'error' in body ? body.error : undefined
      if (response.status === 400 && code === 'invalid_grant') throw new DiscordOAuthError('grant_rejected')
      throw new DiscordOAuthError('provider_unavailable', retryDelay(response, body))
    }
    const parsed = TokenResponseSchema.safeParse(body)
    if (!parsed.success) throw new DiscordOAuthError('provider_unavailable')
    return parsed.data
  } catch (error) {
    if (error instanceof DiscordOAuthError) throw error
    throw new DiscordOAuthError('provider_unavailable')
  }
}

export function exchangeDiscordCode(code: string, redirectURI: string, codeVerifier?: string) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectURI,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  })
}

/** Low-level compatibility helper. Transient failures are never treated as revoked credentials. */
export function exchangeDiscordRefreshToken(refreshToken: string) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

export async function saveDiscordCredentials(discordID: string, input: unknown) {
  await assertAllowed(discordID)
  const token = TokenResponseSchema.parse(input)
  const data = {
    accessToken: encrypt(token.access_token, discordID, 'access'),
    refreshToken: encrypt(token.refresh_token, discordID, 'refresh'),
    creationDate: new Date(),
    expirationDate: new Date(Date.now() + token.expires_in * 1_000),
  }
  const saved = await prisma.gm_discordToken.upsert({
    where: { discordID },
    create: { discordID, ...data, version: 0 },
    update: { ...data, version: { increment: 1 } },
  })
  if (await isErasureBlocked(discordID)) {
    await prisma.gm_discordToken.deleteMany({
      where: { discordID, version: saved.version, refreshToken: saved.refreshToken },
    })
    throw new DiscordOAuthError('privacy_blocked')
  }
  await invalidateGuildPermissions(discordID)
  return saved
}

function rowResponse(row: CredentialRow): DiscordTokenResponse {
  return {
    access_token: decrypt(row.accessToken, row.discordID, 'access'),
    refresh_token: decrypt(row.refreshToken, row.discordID, 'refresh'),
    token_type: 'Bearer',
    expires_in: Math.max(0, Math.floor((row.expirationDate.getTime() - Date.now()) / 1_000)),
  }
}

async function rememberFailure(discordID: string, version: number, error: DiscordOAuthError) {
  try {
    const key = retryKey(discordID, version)
    const previous = await redis.get(key)
    const parsed = previous ? (JSON.parse(previous) as { attempt?: number }) : undefined
    const attempt = Math.min(8, (parsed?.attempt || 0) + 1)
    const seconds = error.retryAfter ?? Math.min(300, 2 ** attempt + Math.floor(Math.random() * 3))
    await redis.set(
      key,
      JSON.stringify({ attempt, until: Date.now() + seconds * 1_000 }),
      'EX',
      Math.max(86_400, seconds + 1),
    )
  } catch {
    // Failure to store a retry schedule never deletes authoritative credentials.
  }
}

async function refresh(discordID: string, expectedVersion?: number): Promise<DiscordTokenResponse | null> {
  await assertAllowed(discordID)
  const initial = await prisma.gm_discordToken.findUnique({ where: { discordID } })
  if (!initial) return null
  if (
    expectedVersion !== undefined &&
    initial.version !== expectedVersion &&
    initial.expirationDate.getTime() > Date.now() + REFRESH_SKEW_MS
  )
    return rowResponse(initial)
  const version = initial.version
  const owner = randomUUID()
  let acquired = false
  try {
    const cached = await redis.get(retryKey(discordID, version))
    if (cached) {
      const schedule = JSON.parse(cached) as { until: number }
      if (schedule.until > Date.now())
        throw new DiscordOAuthError(
          'provider_unavailable',
          Math.max(1, Math.ceil((schedule.until - Date.now()) / 1_000)),
        )
    }
    const deadline = Date.now() + LOCK_WAIT_MS
    while (!acquired) {
      acquired = (await redis.set(lockKey(discordID), owner, 'PX', LOCK_TTL_MS, 'NX')) === 'OK'
      if (acquired) break
      const current = await prisma.gm_discordToken.findUnique({ where: { discordID } })
      if (!current) throw new DiscordOAuthError('grant_rejected')
      if (current.version !== version && current.expirationDate.getTime() > Date.now()) return rowResponse(current)
      if (Date.now() >= deadline) throw new DiscordOAuthError('provider_unavailable', 1)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  } catch (error) {
    if (error instanceof DiscordOAuthError) throw error
    throw new DiscordOAuthError('provider_unavailable')
  }

  try {
    await assertAllowed(discordID)
    const row = await prisma.gm_discordToken.findUnique({ where: { discordID } })
    if (!row) return null
    if (row.version !== version && row.expirationDate.getTime() > Date.now()) return rowResponse(row)
    let token: DiscordTokenResponse
    try {
      token = await exchangeDiscordRefreshToken(decrypt(row.refreshToken, discordID, 'refresh'))
    } catch (error) {
      if (error instanceof DiscordOAuthError && error.code === 'grant_rejected') {
        // Only the grant version sent to Discord may be invalidated. A concurrent login wins.
        const rejected = await prisma.gm_discordToken.deleteMany({
          where: { discordID, version: row.version, refreshToken: row.refreshToken },
        })
        if (rejected.count > 0) await invalidateGuildPermissions(discordID)
        if (rejected.count === 0) {
          const current = await prisma.gm_discordToken.findUnique({ where: { discordID } })
          if (current && current.expirationDate.getTime() > Date.now()) return rowResponse(current)
        }
      } else if (error instanceof DiscordOAuthError) {
        await rememberFailure(discordID, row.version, error)
      }
      throw error
    }
    await assertAllowed(discordID)
    const rotatedAccessToken = encrypt(token.access_token, discordID, 'access')
    const rotatedRefreshToken = encrypt(token.refresh_token, discordID, 'refresh')
    const result = await prisma.gm_discordToken.updateMany({
      where: { discordID, version: row.version, refreshToken: row.refreshToken },
      data: {
        accessToken: rotatedAccessToken,
        refreshToken: rotatedRefreshToken,
        creationDate: new Date(),
        expirationDate: new Date(Date.now() + token.expires_in * 1_000),
        version: { increment: 1 },
      },
    })
    if (await isErasureBlocked(discordID)) {
      if (result.count > 0)
        await prisma.gm_discordToken.deleteMany({
          where: { discordID, version: row.version + 1, refreshToken: rotatedRefreshToken },
        })
      throw new DiscordOAuthError('privacy_blocked')
    }
    if (result.count === 0) {
      const current = await prisma.gm_discordToken.findUnique({ where: { discordID } })
      if (!current) return null
      return rowResponse(current)
    }
    return token
  } finally {
    await redis.eval(LOCK_RELEASE, 1, lockKey(discordID), owner).catch(() => undefined)
  }
}

/** One rotation per account locally, plus a distributed lease and version check across services. */
export async function refreshDiscordCredentials(
  discordID: string,
  expectedVersion?: number,
): Promise<DiscordTokenResponse | null> {
  const existing = inFlight.get(discordID)
  if (existing) return existing
  const operation = refresh(discordID, expectedVersion)
  inFlight.set(discordID, operation)
  try {
    return await operation
  } finally {
    if (inFlight.get(discordID) === operation) inFlight.delete(discordID)
  }
}

export async function getValidDiscordToken(discordID: string): Promise<string> {
  await assertAllowed(discordID)
  const row = await prisma.gm_discordToken.findUnique({ where: { discordID } })
  if (!row) throw new DiscordOAuthError('grant_rejected')
  if (row.expirationDate.getTime() > Date.now() + REFRESH_SKEW_MS) return decrypt(row.accessToken, discordID, 'access')
  try {
    const refreshed = await refreshDiscordCredentials(discordID)
    if (!refreshed) throw new DiscordOAuthError('grant_rejected')
    return refreshed.access_token
  } catch (error) {
    // A short provider outage does not invalidate an access token that is still usable.
    if (error instanceof DiscordOAuthError && error.code === 'provider_unavailable') {
      const current = await prisma.gm_discordToken.findUnique({ where: { discordID } })
      if (current && current.expirationDate.getTime() > Date.now())
        return decrypt(current.accessToken, discordID, 'access')
    }
    throw error
  }
}

/** Explicit API lifecycle; imports never start background network/database work. */
export function startDiscordTokenRefreshWorker() {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let cursor: string | undefined
  const beginTick = () => {
    if (stopped) return
    running = tick()
    void running.finally(() => {
      running = undefined
    })
  }
  const tick = async () => {
    try {
      const rows = await prisma.gm_discordToken.findMany({
        where: {
          expirationDate: { lte: new Date(Date.now() + 5 * 60_000) },
          ...(cursor ? { discordID: { gt: cursor } } : {}),
        },
        orderBy: { discordID: 'asc' },
        take: 20,
        select: { discordID: true, version: true },
      })
      cursor = rows.length === 20 ? rows.at(-1)!.discordID : undefined
      // Small batches bound work; no new tick is scheduled until this batch finishes.
      for (let index = 0; index < rows.length && !stopped; index += 4) {
        await Promise.all(
          rows.slice(index, index + 4).map(async ({ discordID, version }) => {
            try {
              if (await refreshDiscordCredentials(discordID, version)) gmLog('auth', 'Discord grant ready')
            } catch (error) {
              const code = error instanceof DiscordOAuthError ? error.code : 'provider_unavailable'
              gmLog('auth', `Discord grant refresh deferred: ${code}`)
            }
          }),
        )
      }
    } catch {
      gmLog('auth', 'Discord refresh worker temporarily unavailable')
    } finally {
      if (!stopped) timer = setTimeout(beginTick, 30_000)
    }
  }
  timer = setTimeout(beginTick, 0)
  return async () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    // Persist any rotated credentials before the API closes Redis/Prisma on shutdown.
    await running
  }
}
