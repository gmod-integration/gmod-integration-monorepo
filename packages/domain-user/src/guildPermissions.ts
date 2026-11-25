import { randomUUID } from 'node:crypto'
import redis from '@gmod/infra-redis'

export const DISCORD_GUILD_PERMISSIONS_CHANNEL = 'gmi:discord:guild-permissions-invalidated'
const GLOBAL_REVISION_KEY = 'gmi:discord:guild-permissions:revision'
const userRevisionKey = (discordID: string) => `user:${discordID}:guild-permissions-revision`

export type DiscordGuildPermissionsInvalidation = { guildID?: string; discordID?: string; revision: string }

/** Kept separately from the short-lived guild list so an in-flight lookup cannot undo invalidation. */
export async function readDiscordGuildPermissionsRevision(discordID: string): Promise<string> {
  const revisions = await redis.mget(GLOBAL_REVISION_KEY, userRevisionKey(discordID))
  return JSON.stringify(revisions.map((revision) => revision || '0'))
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
    // A role/ownership change can affect members absent from the bot's member cache.
    await redis.set(GLOBAL_REVISION_KEY, revision)
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
