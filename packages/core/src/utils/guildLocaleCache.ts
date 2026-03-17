import redis from '@gmod/infra-redis'
import { enqueueDiscordGuildSnapshot, isBullMQReplyTimeoutError } from '@gmod/infra-bullmq/discordQueueAdapters.js'

const GUILD_LOCALE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
const GUILD_LOCALE_FALLBACK_TTL_SECONDS = 60

function normalizeLocale(locale?: string | null): string {
  return locale && locale.length > 0 ? locale.substring(0, 2) : 'en'
}

function getGuildLocaleCacheKey(guildID: string): string {
  return `discord:guild:${guildID}:preferredLocale`
}

export async function getCachedGuildPreferredLocale(guildID: string): Promise<string | null> {
  const cached = await redis.get(getGuildLocaleCacheKey(guildID))
  return cached ? normalizeLocale(cached) : null
}

export async function setCachedGuildPreferredLocale(
  guildID: string,
  preferredLocale: string,
  ttlSeconds = GUILD_LOCALE_CACHE_TTL_SECONDS,
): Promise<void> {
  await redis.set(getGuildLocaleCacheKey(guildID), normalizeLocale(preferredLocale), 'EX', ttlSeconds)
}

export async function deleteCachedGuildPreferredLocale(guildID: string): Promise<void> {
  await redis.del(getGuildLocaleCacheKey(guildID))
}

export async function resolveGuildPreferredLocale(guildID: string, timeoutMs = 3000): Promise<string> {
  const cached = await getCachedGuildPreferredLocale(guildID)
  if (cached) {
    return cached
  }

  try {
    const snapshot = await enqueueDiscordGuildSnapshot(guildID, timeoutMs)
    if (snapshot?.preferredLocale) {
      const locale = normalizeLocale(snapshot.preferredLocale)
      await setCachedGuildPreferredLocale(guildID, locale)
      return locale
    }
  } catch (error) {
    if (!isBullMQReplyTimeoutError(error)) {
      console.error(`[guild-locale-cache] Failed to resolve guild locale for ${guildID}: ${(error as Error).message}`)
    }
  }

  await setCachedGuildPreferredLocale(guildID, 'en', GUILD_LOCALE_FALLBACK_TTL_SECONDS)
  return 'en'
}
