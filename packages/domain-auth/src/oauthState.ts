import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ConfigAuth, ConfigServer } from '@gmod/config'
import redis from '@gmod/infra-redis'
import { AuthSessionError } from './authSessions.js'

export function internalRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return '/dashboard/guilds'
  try {
    const url = new URL(value, ConfigServer.websiteUrl)
    if (url.origin !== new URL(ConfigServer.websiteUrl).origin) return '/dashboard/guilds'
    return url.pathname + url.search + url.hash
  } catch {
    return '/dashboard/guilds'
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export async function beginOAuthFlow(redirect: unknown, browserBinding?: string) {
  const binding =
    browserBinding && /^[A-Za-z0-9_-]{43}$/.test(browserBinding)
      ? browserBinding
      : randomBytes(32).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const destination = internalRedirect(redirect)
  const guildID = destination.match(/^\/dashboard\/guilds\/(\d+)(?:\/|$)/)?.[1]
  await redis.set(
    `gmi:auth:oauth-state:${digest(state)}`,
    JSON.stringify({ bindingHash: digest(binding), verifier, redirect: destination, guildID }),
    'EX',
    ConfigAuth.oauthStateTtlSeconds,
  )
  return { state, browserBinding: binding, codeChallenge: createHash('sha256').update(verifier).digest('base64url') }
}

export async function consumeOAuthFlow(
  state: unknown,
  binding?: string,
): Promise<{ verifier: string; redirect: string; guildID?: string }> {
  const invalid = () =>
    new AuthSessionError(400, 'oauth_state_invalid', 'This sign-in attempt has expired. Please sign in again.')
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || !binding) throw invalid()
  const raw = await redis.getdel(`gmi:auth:oauth-state:${digest(state)}`)
  if (!raw) throw invalid()
  let value: { bindingHash?: string; verifier?: string; redirect?: string; guildID?: string }
  try {
    value = JSON.parse(raw)
  } catch {
    throw invalid()
  }
  const actual = digest(binding)
  if (
    value.bindingHash?.length !== actual.length ||
    !timingSafeEqual(Buffer.from(value.bindingHash), Buffer.from(actual)) ||
    typeof value.verifier !== 'string'
  )
    throw invalid()
  return {
    verifier: value.verifier,
    redirect: internalRedirect(value.redirect),
    ...(value.guildID ? { guildID: value.guildID } : {}),
  }
}
