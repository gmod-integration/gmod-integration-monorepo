import { randomUUID } from 'node:crypto'
import redis from '@gmod/infra-redis'

export const DISCORD_GUILD_PERMISSIONS_CHANNEL = 'gmi:discord:guild-permissions-invalidated'
const GLOBAL_REVISION_KEY = 'gmi:discord:guild-permissions:revision'
const userRevisionKey = (discordID: string) => `user:${discordID}:guild-permissions-revision`
const guildRevisionKey = (guildID: string) => `guild:${guildID}:oauth-permissions-revision`
const INVALIDATE_GUILD = "redis.call('set', KEYS[1], ARGV[1]); redis.call('set', KEYS[2], ARGV[1]); return 1"

export type DiscordGuildPermissionsInvalidation = { guildID?: string; discordID?: string; revision: string }

/** An epoch detects changes while a provider request has not yet returned its membership scope. */
export async function readDiscordGuildPermissionsEpoch(discordID: string): Promise<string> {
  const revisions = await redis.mget(GLOBAL_REVISION_KEY, userRevisionKey(discordID))
  return JSON.stringify(revisions.map((revision) => revision || '0'))
}

export async function readDiscordGuildPermissionsScope(discordID: string): Promise<string[] | null> {
  const cached = await redis.get(`user:${discordID}:guilds`)
  if (!cached) return null
  try {
    const value = JSON.parse(cached)
    if (
      !Array.isArray(value?.guilds) ||
      value.guilds.some((guild: { id?: unknown } | null) => !guild || typeof guild.id !== 'string')
    )
      return null
    return value.guilds.map((guild: { id: string }) => guild.id)
  } catch {
    return null
  }
}

/** All memberships count, including guilds where the account has not yet gained administrator rights. */
export async function readDiscordGuildPermissionsRevision(
  discordID: string,
  guildIDs?: readonly string[],
): Promise<string> {
  const ids = [...new Set(guildIDs ?? (await readDiscordGuildPermissionsScope(discordID)) ?? [])].sort()
  const revisions = await redis.mget(userRevisionKey(discordID), ...ids.map(guildRevisionKey))
  return JSON.stringify([revisions[0] || '0', ...ids.map((id, index) => [id, revisions[index + 1] || '0'])])
}

export async function invalidateDiscordGuildPermissions(input: {
  guildID?: string
  discordID?: string
}): Promise<void> {
  if (!input.guildID && !input.discordID) throw new Error('A Discord community or account is required.')
  const revision = randomUUID()
  if (input.discordID) {
    // Outlive both the OAuth cache (120s) and the gateway snapshot (30s).
    await redis.set(userRevisionKey(input.discordID), revision, 'EX', 300)
    await redis.del(`user:${input.discordID}:guilds`)
  } else {
    // Durable guild revisions cover members absent from the bot cache without expiring unrelated accounts.
    // Updating the scoped revision and in-flight epoch atomically prevents stale rights being
    // stamped with a new guild revision before the request's epoch guard can observe it.
    await redis.eval(INVALIDATE_GUILD, 2, guildRevisionKey(input.guildID!), GLOBAL_REVISION_KEY, revision)
  }
  await redis.publish(DISCORD_GUILD_PERMISSIONS_CHANNEL, JSON.stringify({ ...input, revision }))
}

export function parseDiscordGuildPermissionsInvalidation(payload: string): DiscordGuildPermissionsInvalidation | null {
  try {
    const value = JSON.parse(payload)
    if (
      !value ||
      typeof value.revision !== 'string' ||
      !value.revision ||
      (value.discordID !== undefined && (typeof value.discordID !== 'string' || !value.discordID)) ||
      (value.guildID !== undefined && (typeof value.guildID !== 'string' || !value.guildID)) ||
      (!value.discordID && !value.guildID)
    )
      return null
    return value
  } catch {
    return null
  }
}
