import { randomUUID } from 'node:crypto'
import { getUserFromDiscordID } from './User.js'
import redis from '@gmod/infra-redis'
import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from './privacy.js'
import { AuthSessionError, resolveApplicationSession, type AuthSession } from '@gmod/domain-auth/authSessions.js'
import { getValidDiscordToken, refreshDiscordCredentials } from '@gmod/domain-auth/discordOAuth.js'
import { readDiscordGuildPermissionsEpoch, readDiscordGuildPermissionsRevision } from './guildPermissions.js'

const GUILD_CACHE_SECONDS = 120
const GUILD_LOCK_MS = 30_000
const GUILD_LOCK_WAIT_MS = 3_000
const RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

export class GuildPermissionsUnavailableError extends Error {
  readonly code = 'provider_unavailable'
  readonly status = 503
  constructor(readonly retryAfter?: number) {
    super('Discord permissions are temporarily unavailable. Please try again.')
  }
}

export type DiscordGuild = {
  id: string
  name?: string
  icon?: string | null
  owner?: boolean
  permissions?: string | number
  [key: string]: unknown
}
export type GuildPermissionLookupOptions = { fresh?: boolean; requestScope?: object }
type RequestPermissions = { guilds: DiscordGuild[]; revision: string; fresh: boolean; expiresAt: number }
function guildList(value: unknown): DiscordGuild[] {
  if (
    !Array.isArray(value) ||
    value.some((guild) => !guild || typeof guild !== 'object' || typeof guild.id !== 'string')
  )
    throw new GuildPermissionsUnavailableError()
  return value
}

export class PanelUser {
  private readonly requestPermissions = new WeakMap<object, RequestPermissions>()
  private readonly requestLookups = new WeakMap<object, { promise: Promise<DiscordGuild[]>; fresh: boolean }>()
  public user: any
  public discordID: string
  public authSession?: AuthSession
  public panelToken: {
    id?: string
    creationDate: Date
    token: string
    expirationDate: Date
  }

  constructor(obj: any) {
    this.user = obj.user
    this.discordID = obj.discordID
    this.authSession = obj.authSession
    this.panelToken = {
      id: obj.panelToken.id,
      token: obj.panelToken.token,
      creationDate: obj.panelToken.creationDate,
      expirationDate: obj.panelToken.expirationDate,
    }
  }

  /** Provider credentials are resolved and refreshed only when a Discord operation needs them. */
  async getDiscordToken() {
    try {
      return await getValidDiscordToken(this.discordID)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'grant_rejected')
        throw new AuthSessionError(403, 'discord_reauth_required', 'Reconnect Discord to continue.')
      throw error
    }
  }

  async isValidDiscordToken() {
    try {
      return !!(await this.getDiscordToken())
    } catch {
      return false
    }
  }

  async isValidPanelToken(token: string) {
    if (await isErasureBlocked(this.discordID)) return false
    const session = await resolveApplicationSession(token)
    return !!session && session.discordID === this.discordID && !(await isErasureBlocked(this.discordID))
  }

  async authAllowed(token: string) {
    return this.isValidPanelToken(token)
  }

  async findGuilds(options: GuildPermissionLookupOptions = {}): Promise<DiscordGuild[]> {
    const scope = options.requestScope
    if (!scope) return this.lookupGuilds(options)
    const pending = this.requestLookups.get(scope)
    if (pending && (!options.fresh || pending.fresh)) {
      await pending.promise
      // Recheck privacy, the current grant and durable revisions after the shared request resolves.
      return this.lookupGuilds(options)
    }
    const promise = this.lookupGuilds(options)
    this.requestLookups.set(scope, { promise, fresh: !!options.fresh })
    try {
      return await promise
    } finally {
      if (this.requestLookups.get(scope)?.promise === promise) this.requestLookups.delete(scope)
    }
  }

  private async lookupGuilds(options: GuildPermissionLookupOptions): Promise<DiscordGuild[]> {
    if (await isErasureBlocked(this.discordID)) return []
    // A cached permission list cannot outlive a revoked Discord grant.
    let token = await this.getDiscordToken()
    const cacheKey = `user:${this.discordID}:guilds`
    const lockKey = `user:${this.discordID}:guild-permissions-lock`
    const retryKey = `user:${this.discordID}:guild-permissions-retry`
    const remember = (guilds: DiscordGuild[], revision: string, fresh: boolean) => {
      if (options.requestScope)
        this.requestPermissions.set(options.requestScope, {
          guilds,
          revision,
          fresh,
          expiresAt: Date.now() + GUILD_CACHE_SECONDS * 1_000,
        })
      return guilds
    }
    const scoped = options.requestScope && this.requestPermissions.get(options.requestScope)
    if (
      scoped &&
      scoped.expiresAt > Date.now() &&
      (!options.fresh || scoped.fresh) &&
      scoped.revision ===
        (await readDiscordGuildPermissionsRevision(
          this.discordID,
          scoped.guilds.map((guild) => guild.id),
        ))
    )
      return scoped.guilds
    const readCached = async (): Promise<DiscordGuild[] | null> => {
      if (options.fresh) return null
      const cached = await redis.get(cacheKey)
      if (cached === null) return null
      try {
        const value = JSON.parse(cached)
        const guilds = guildList(value?.guilds)
        const revision = await readDiscordGuildPermissionsRevision(
          this.discordID,
          guilds.map((guild) => guild.id),
        )
        if (value.revision === revision) return remember(guilds, revision, false)
      } catch {
        // A damaged or pre-revision cache is discarded rather than trusted for authorization.
      }
      await redis.del(cacheKey)
      return null
    }
    const cached = await readCached()
    if (cached !== null) return cached
    const checkRetry = async () => {
      const schedule = await redis.get(retryKey)
      const until = Number(schedule)
      if (Number.isFinite(until) && until > Date.now())
        throw new GuildPermissionsUnavailableError(Math.max(1, Math.ceil((until - Date.now()) / 1_000)))
    }
    await checkRetry()

    const owner = randomUUID()
    const deadline = Date.now() + GUILD_LOCK_WAIT_MS
    let acquired = false
    while (!acquired) {
      acquired = (await redis.set(lockKey, owner, 'PX', GUILD_LOCK_MS, 'NX')) === 'OK'
      if (acquired) break
      const filled = await readCached()
      if (filled !== null) {
        return filled
      }
      if (Date.now() >= deadline) throw new GuildPermissionsUnavailableError()
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    try {
      const filled = await readCached()
      if (filled !== null) return filled
      // A contender may have received a 429 while this request waited for the lease.
      await checkRetry()
      const epoch = await readDiscordGuildPermissionsEpoch(this.discordID)
      const request = async (token: string) =>
        fetch('https://discord.com/api/users/@me/guilds', {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        })
      let response: Response
      try {
        response = await request(token)
        if (response.status === 401) {
          await refreshDiscordCredentials(this.discordID)
          token = await this.getDiscordToken()
          response = await request(token)
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) {
          if (error.code === 'discord_reauth_required') throw error
          if (error.code === 'grant_rejected')
            throw new AuthSessionError(403, 'discord_reauth_required', 'Reconnect Discord to continue.')
        }
        throw new GuildPermissionsUnavailableError()
      }
      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthSessionError(403, 'discord_reauth_required', 'Reconnect Discord to continue.')
        }
        if (response.status === 429) {
          const header = response.headers?.get('retry-after')
          const body = await response.json?.().catch(() => undefined)
          const input = header ?? body?.retry_after
          const seconds =
            typeof input === 'string' && !Number.isFinite(Number(input))
              ? (Date.parse(input) - Date.now()) / 1_000
              : Number(input)
          const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1
          await redis.set(retryKey, String(Date.now() + retryAfter * 1_000), 'PX', retryAfter * 1_000)
          throw new GuildPermissionsUnavailableError(retryAfter)
        }
        throw new GuildPermissionsUnavailableError()
      }
      let guilds: DiscordGuild[]
      try {
        guilds = guildList(await response.json())
      } catch {
        throw new GuildPermissionsUnavailableError()
      }
      if (await isErasureBlocked(this.discordID)) return []
      if ((await readDiscordGuildPermissionsEpoch(this.discordID)) !== epoch)
        throw new GuildPermissionsUnavailableError()
      const revision = await readDiscordGuildPermissionsRevision(
        this.discordID,
        guilds.map((guild) => guild.id),
      )
      if ((await readDiscordGuildPermissionsEpoch(this.discordID)) !== epoch)
        throw new GuildPermissionsUnavailableError()
      await redis.set(cacheKey, JSON.stringify({ revision, guilds }), 'EX', GUILD_CACHE_SECONDS)
      await redis.del(retryKey)
      if ((await readDiscordGuildPermissionsEpoch(this.discordID)) !== epoch)
        throw new GuildPermissionsUnavailableError()
      return remember(guilds, revision, true)
    } finally {
      await redis.eval(RELEASE_LOCK, 1, lockKey, owner)
    }
  }

  async findGuildsWithPerms(options: GuildPermissionLookupOptions = {}) {
    const guilds = await this.findGuilds(options)
    return guilds.filter((guild) => {
      if (guild.owner) return true
      try {
        return (BigInt(guild.permissions ?? 0) & 8n) === 8n
      } catch {
        return false
      }
    })
  }

  async isAdminOfGuild(guildID: string, options: GuildPermissionLookupOptions = {}) {
    return (await this.findGuildsWithPerms(options)).some((guild) => guild.id === guildID)
  }
}

/** HTTP callers supply the exact resolved session; internal Discord callers may resolve by account. */
export async function getPanelUserFromDiscordID(discordID: string, token?: string, resolvedSession?: AuthSession) {
  if (await isErasureBlocked(discordID)) return null
  const session = resolvedSession ?? (token ? await resolveApplicationSession(token) : undefined)
  if ((resolvedSession || token) && (!session || session.discordID !== discordID)) return null
  const panelInfo = session
    ? {
        id: session.id,
        discordID,
        accessToken: token || '',
        creationDate: session.createdAt,
        expirationDate: session.expiresAt,
      }
    : await prisma.gm_panelToken.findFirst({
        where: { discordID, revoke: false, expirationDate: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
  const user = await getUserFromDiscordID(discordID)
  if (!panelInfo || !user || (await isErasureBlocked(discordID))) return null
  return new PanelUser({
    user,
    discordID,
    authSession: session,
    panelToken: {
      id: panelInfo.id,
      token: token || panelInfo.accessToken,
      creationDate: panelInfo.creationDate,
      expirationDate: panelInfo.expirationDate,
    },
  })
}
