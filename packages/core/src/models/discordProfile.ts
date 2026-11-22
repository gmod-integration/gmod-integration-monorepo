import redis from '@gmod/infra-redis'
import { enqueueMainClientFetchUser } from '@gmod/infra-bullmq/discordQueueAdapters.js'

export interface DiscordProfileDecoration {
  globalName: string
  displayName: string
  avatarURL: string
  discriminator: string
}

const PROFILE_TTL_SECONDS = 3600
const RETRY_SECONDS = 60
const CACHE_TIMEOUT_MS = 250
const PROVIDER_TIMEOUT_MS = 1500
const inFlight = new Map<string, Promise<DiscordProfileDecoration>>()
// Keep only retry times in memory, so a Redis outage cannot trigger a Discord lookup on every poll.
const retryAfter = new Map<string, number>()

async function optional<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | number | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function decoration(value: unknown): DiscordProfileDecoration {
  const text = (key: string) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    const field: unknown = Reflect.get(value, key)
    return typeof field === 'string' ? field : ''
  }
  let avatarURL = text('avatarURL')
  try {
    if (!['https:', 'http:'].includes(new URL(avatarURL).protocol)) avatarURL = ''
  } catch {
    avatarURL = ''
  }
  return {
    globalName: text('globalName'),
    displayName: text('displayName'),
    avatarURL,
    discriminator: text('discriminator'),
  }
}

async function loadProfile(discordID: string): Promise<DiscordProfileDecoration> {
  const key = `gmi:auth:profile:${discordID}`
  const cached = await optional(() => redis.get(key), CACHE_TIMEOUT_MS)
  let value: unknown
  try {
    value = cached ? JSON.parse(cached) : undefined
  } catch {
    value = undefined
  }
  const profile = decoration(value)
  if (profile.avatarURL) {
    retryAfter.delete(discordID)
    return profile
  }
  const cachedRetry = value && typeof value === 'object' && 'retryAfter' in value ? value.retryAfter : undefined
  const nextRetry = Math.max(typeof cachedRetry === 'number' ? cachedRetry : 0, retryAfter.get(discordID) || 0)
  if (nextRetry > Date.now()) return profile
  retryAfter.delete(discordID)

  const user = await optional(() => enqueueMainClientFetchUser(discordID, PROVIDER_TIMEOUT_MS), PROVIDER_TIMEOUT_MS)
  if (user?.id === discordID && decoration(user).avatarURL) {
    const hydrated = decoration({
      globalName: user.displayName || profile.globalName || user.username,
      displayName: user.displayName || profile.displayName || user.username,
      avatarURL: user.avatarURL,
      discriminator: profile.discriminator,
    })
    await optional(() => redis.set(key, JSON.stringify(hydrated), 'EX', PROFILE_TTL_SECONDS), CACHE_TIMEOUT_MS)
    return hydrated
  }

  const until = Date.now() + RETRY_SECONDS * 1000
  retryAfter.set(discordID, until)
  if (retryAfter.size > 1000) retryAfter.delete(retryAfter.keys().next().value!)
  await optional(
    () => redis.set(key, JSON.stringify({ ...profile, retryAfter: until }), 'EX', RETRY_SECONDS),
    CACHE_TIMEOUT_MS,
  )
  return profile
}

/** Profile decoration is best effort and never changes the authenticated identity or its credentials. */
export function getDiscordProfile(discordID: string): Promise<DiscordProfileDecoration> {
  if (!/^\d{1,30}$/.test(discordID)) return Promise.resolve(decoration(undefined))
  const existing = inFlight.get(discordID)
  if (existing) return existing
  const operation = loadProfile(discordID).finally(() => inFlight.delete(discordID))
  inFlight.set(discordID, operation)
  return operation
}
