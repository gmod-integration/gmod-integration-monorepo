import { batch, createSignal } from 'solid-js'
import { WEBSITE_CONFIG } from '../config.js'
import { normalizeDiscordUserPayload, setDiscordUser, setIsAdmin, setIsLogged, type DiscordUserState } from './event.js'
import { notifyDashboardAccessDenied } from './accessEvents.js'

export type AuthStatus = 'checking' | 'authenticated' | 'temporarily_unavailable' | 'reauth_required' | 'signed_out'
export type AuthSession = {
  authenticated: true
  user: DiscordUserState & { rank?: string }
  session: { id: string; expiresAt: string; absoluteExpiresAt: string; actorDiscordID?: string }
  csrfToken: string
}
export const AUTH_CHANGE_EVENT = 'gmi:auth-change'
export const AUTH_STORAGE_KEY = 'gmi:auth-event'
export const LOGOUT_PENDING_KEY = 'gmi:logout-pending'
let memoryLogoutPending = false
let pendingIntentPersisted = false
let logoutRequest: Promise<void> | undefined

function readAuthCache(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeAuthCache(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
function removeAuthCache(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* Server authority and in-memory cleanup do not depend on browser cache access. */
  }
}

/** A pending logout must not be undone by focus, network recovery or another tab. */
export function isLogoutPending() {
  try {
    const persisted = localStorage.getItem(LOGOUT_PENDING_KEY)
    // A confirmed logout in another tab may clear a shared marker after our own failed attempt.
    if (pendingIntentPersisted && !persisted && !logoutRequest) {
      memoryLogoutPending = false
      pendingIntentPersisted = false
    }
    return memoryLogoutPending || !!persisted
  } catch {
    return memoryLogoutPending
  }
}
export const [authStatus, setAuthStatus] = createSignal<AuthStatus>('checking')
export const [authSession, setAuthSession] = createSignal<AuthSession>()
let request: Promise<AuthSession | undefined> | undefined
let sessionController: AbortController | undefined
const activeRequests = new Set<AbortController>()
let generation = 0

function invalidatePendingRequests() {
  generation++
  sessionController?.abort()
  sessionController = undefined
  request = undefined
  for (const controller of activeRequests) controller.abort()
  activeRequests.clear()
}

function validSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<AuthSession>
  return (
    data.authenticated === true &&
    typeof data.user?.id === 'string' &&
    !!data.user.id &&
    typeof data.session?.id === 'string' &&
    !!data.session.id &&
    Number.isFinite(Date.parse(data.session.expiresAt)) &&
    Number.isFinite(Date.parse(data.session.absoluteExpiresAt)) &&
    typeof data.csrfToken === 'string' &&
    !!data.csrfToken
  )
}

function notify() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}
export function broadcastAuthChange() {
  writeAuthCache(AUTH_STORAGE_KEY, JSON.stringify({ nonce: crypto.randomUUID(), at: Date.now() }))
}

/** The server supplies identity and expiry; browser storage is only a presentation cache. */
export function acceptAuthSession(value: AuthSession) {
  if (isLogoutPending()) {
    resetAuthentication()
    return
  }
  if (authSession() && authSession()!.session.id !== value.session.id) invalidatePendingRequests()
  const previousID = authSession()?.user.id || readAuthCache('discordID')
  if (previousID && previousID !== value.user.id) {
    removeAuthCache('guilds')
    removeAuthCache('server')
  }
  const normalized = { ...normalizeDiscordUserPayload(value.user), rank: value.user.rank }
  removeAuthCache('accessToken')
  removeAuthCache('expirationDate')
  removeAuthCache('oldAccessToken')
  removeAuthCache('oldExpirationDate')
  removeAuthCache('oldDiscordID')
  writeAuthCache('discordID', normalized.id)
  writeAuthCache('discordUser', JSON.stringify(normalized))
  batch(() => {
    setAuthSession({ ...value, user: normalized })
    setDiscordUser(normalized)
    setIsAdmin(normalized.rank === 'developer')
    setIsLogged(true)
    setAuthStatus('authenticated')
  })
  notify()
}

export function resetAuthentication() {
  invalidatePendingRequests()
  for (const key of [
    'accessToken',
    'expirationDate',
    'oldAccessToken',
    'oldExpirationDate',
    'oldDiscordID',
    'discordID',
    'discordUser',
  ])
    removeAuthCache(key)
  batch(() => {
    setAuthSession(undefined)
    setDiscordUser(normalizeDiscordUserPayload({}))
    setIsAdmin(false)
    setIsLogged(false)
    setAuthStatus('signed_out')
  })
  notify()
}

const sessionURL = (path: string) => `${WEBSITE_CONFIG.apiUrl}/v6/auth${path}`
const timeout = () => AbortSignal.timeout(12_000)

/** Deduplicates validation and legacy conversion; temporary failures preserve drafts and credentials. */
export function refreshAuthSession(): Promise<AuthSession | undefined> {
  if (isLogoutPending()) {
    resetAuthentication()
    return Promise.resolve(undefined)
  }
  if (request) return request
  const current = generation
  const controller = new AbortController()
  sessionController = controller
  const signal = AbortSignal.any([controller.signal, timeout()])
  const operation = (async () => {
    if (!authSession()) setAuthStatus('checking')
    try {
      let restoredActor = false
      let response = await fetch(sessionURL('/session'), {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (current !== generation) return authSession()
      if (response.status === 401) {
        const denied = await response
          .clone()
          .json()
          .catch(() => undefined)
        if (current !== generation) return authSession()
        if (
          denied?.error?.code === 'actor_session_available' &&
          typeof denied.csrfToken === 'string' &&
          denied.csrfToken
        ) {
          response = await fetch(sessionURL('/impersonations/end'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': denied.csrfToken },
            body: '{}',
            signal,
          })
          restoredActor = response.ok
        }
      }
      if (current !== generation) return authSession()
      const oldToken = readAuthCache('accessToken')
      if (response.status === 401 && oldToken) {
        response = await fetch(sessionURL('/legacy-session'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: oldToken }),
          signal,
        })
        // Another tab may have converted the one-use legacy credential while this request waited.
        if (response.status === 401)
          response = await fetch(sessionURL('/session'), {
            credentials: 'include',
            cache: 'no-store',
            signal,
          })
      }
      if (current !== generation) return authSession()
      if (response.status === 401) {
        resetAuthentication()
        return undefined
      }
      if (!response.ok) throw new Error('Session temporarily unavailable')
      const value: unknown = await response.json()
      if (current !== generation) return authSession()
      if (!validSession(value)) throw new Error('Invalid session acknowledgement')
      acceptAuthSession(value)
      if (restoredActor) broadcastAuthChange()
      return authSession()
    } catch {
      if (current === generation) setAuthStatus('temporarily_unavailable')
      return authSession()
    }
  })()
  request = operation
  void operation.finally(() => {
    if (request === operation) request = undefined
    if (sessionController === controller) sessionController = undefined
  })
  return operation
}

/** A cross-tab identity change supersedes checks made with the previous cookie. */
export function revalidateAuthSession() {
  invalidatePendingRequests()
  return refreshAuthSession()
}

async function sendAuthenticated(input: string, init: RequestInit, current: number): Promise<Response> {
  const controller = new AbortController()
  activeRequests.add(controller)
  try {
    const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal
    const response = await fetch(input, { ...init, signal, credentials: 'include' })
    if (current !== generation) throw new Error('The session changed while the request was pending')
    return response
  } finally {
    activeRequests.delete(controller)
  }
}

/** Cancelling one reader must not cancel the cookie check shared by the rest of the application. */
async function restoreForRequest(signal?: AbortSignal | null) {
  signal?.throwIfAborted()
  if (!signal) return refreshAuthSession()
  let abort!: () => void
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    return await Promise.race([refreshAuthSession(), interrupted])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

async function observeForbiddenResponse(response: Response, requestURL: string, current: number): Promise<void> {
  if (response.status !== 403) return
  const denied = await response
    .clone()
    .json()
    .catch(() => undefined)
  const code = typeof denied?.error === 'string' ? denied.error : denied?.error?.code
  if (current === generation && code === 'discord_reauth_required') setAuthStatus('reauth_required')
  if (current === generation) notifyDashboardAccessDenied(requestURL, denied, authSession()?.session.id)
}

/** All authenticated v3/v6 requests use cookies and the same CSRF/session recovery contract. */
export async function authenticatedFetch(input: string | (() => string), init: RequestInit = {}): Promise<Response> {
  if (isLogoutPending()) throw new Error('Logout must be confirmed before making authenticated requests')
  init.signal?.throwIfAborted()
  const method = (init.method || 'GET').toUpperCase()
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const initial = generation
  const needsIdentity = typeof input === 'function' && ['GET', 'HEAD'].includes(method) && !authSession()
  if ((mutation && !authSession()?.csrfToken) || needsIdentity) {
    const restored = await restoreForRequest(init.signal)
    if (isLogoutPending()) throw new Error('Logout must be confirmed before making authenticated requests')
    if (initial !== generation) throw new Error('The session changed while the request was pending')
    if (needsIdentity && !restored) throw new Error('Session unavailable before resolving the request')
  }
  if (isLogoutPending()) throw new Error('Logout must be confirmed before making authenticated requests')
  init.signal?.throwIfAborted()
  const headers = new Headers(init.headers)
  if (mutation && authSession()?.csrfToken) headers.set('X-CSRF-Token', authSession()!.csrfToken)
  const current = generation
  const url = () => (typeof input === 'function' ? input() : input)
  const requestURL = url()
  const response = await sendAuthenticated(requestURL, { ...init, headers }, current)
  await observeForbiddenResponse(response, requestURL, current)
  if (response.status !== 401 || current !== generation) return response
  const before = authSession()?.session.id
  const updated = await restoreForRequest(init.signal)
  if (isLogoutPending()) throw new Error('Logout must be confirmed before making authenticated requests')
  if (current !== generation) throw new Error('The session changed while the request was pending')
  init.signal?.throwIfAborted()
  // GET is safe to retry once. A mutation is never replayed without an idempotency guarantee.
  if (!mutation && updated && updated.session.id === before) {
    const retryURL = url()
    const retried = await sendAuthenticated(retryURL, { ...init, headers: new Headers(init.headers) }, current)
    await observeForbiddenResponse(retried, retryURL, current)
    return retried
  }
  return response
}

export async function authCommand(path: string, body?: unknown): Promise<AuthSession> {
  const current = generation
  const response = await authenticatedFetch(sessionURL(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeout(),
  })
  if (!response.ok) throw new Error('Session action unavailable')
  const value: unknown = await response.json()
  if (current !== generation) throw new Error('The session changed while the request was pending')
  if (validSession(value)) {
    acceptAuthSession(value)
    const accepted = authSession()
    if (!accepted || accepted.session.id !== value.session.id) throw new Error('Session action unavailable')
    broadcastAuthChange()
    return accepted
  }
  throw new Error('Invalid session action acknowledgement')
}

export function signOut(): Promise<void> {
  if (logoutRequest) return logoutRequest
  const csrfToken = authSession()?.csrfToken
  const legacyToken = readAuthCache('accessToken')
  const intent = crypto.randomUUID()
  const previousIntent = readAuthCache(LOGOUT_PENDING_KEY)
  // Keep the local barrier active even if storage becomes unavailable after a successful write.
  memoryLogoutPending = true
  const persistedIntent = writeAuthCache(LOGOUT_PENDING_KEY, intent) ? intent : previousIntent
  pendingIntentPersisted = !!persistedIntent
  resetAuthentication()
  broadcastAuthChange()
  const operation = (async () => {
    let csrf = csrfToken
    // Retry obtains only a revocation CSRF challenge. It never adopts or restores this identity.
    if (!csrf) {
      const challenge = await fetch(sessionURL('/session'), {
        credentials: 'include',
        cache: 'no-store',
        signal: timeout(),
      })
      const data: unknown = await challenge.json().catch(() => undefined)
      if (challenge.ok && validSession(data)) csrf = data.csrfToken
      else if (challenge.status === 401) {
        const denied = data as { error?: { code?: string }; csrfToken?: string } | undefined
        if (denied?.error?.code === 'actor_session_available' && typeof denied.csrfToken === 'string')
          csrf = denied.csrfToken
        else if (legacyToken) {
          // Consume the existing one-use legacy credential only to revoke it; never adopt its identity.
          const migrated = await fetch(sessionURL('/legacy-session'), {
            method: 'POST',
            credentials: 'include',
            signal: timeout(),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: legacyToken }),
          })
          const snapshot: unknown = await migrated.json().catch(() => undefined)
          if (migrated.ok && validSession(snapshot)) csrf = snapshot.csrfToken
          else if (migrated.status !== 401) throw new Error('Logout revocation unconfirmed')
        }
      } else throw new Error('Logout revocation unconfirmed')
    }
    const response = await fetch(sessionURL('/logout'), {
      method: 'POST',
      credentials: 'include',
      signal: timeout(),
      headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
    })
    if (!response.ok) throw new Error('Logout revocation unconfirmed')
    const acknowledgement: unknown = await response.json().catch(() => undefined)
    if (
      !acknowledgement ||
      typeof acknowledgement !== 'object' ||
      !('revoked' in acknowledgement) ||
      acknowledgement.revoked !== true
    )
      throw new Error('Logout revocation unconfirmed')
    // A successful retry may resolve an older marker when quota/privacy settings refused its replacement.
    // Never clear an intent published by another tab after this operation started.
    if (persistedIntent && readAuthCache(LOGOUT_PENDING_KEY) === persistedIntent) removeAuthCache(LOGOUT_PENDING_KEY)
    memoryLogoutPending = false
    pendingIntentPersisted = false
    resetAuthentication()
    broadcastAuthChange()
  })()
  logoutRequest = operation
  void operation.then(
    () => {
      if (logoutRequest === operation) logoutRequest = undefined
    },
    () => {
      if (logoutRequest === operation) logoutRequest = undefined
    },
  )
  return operation
}

export function safeAuthRedirect(value: string | null | undefined, fallback = '/dashboard/guilds') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value))
    return fallback
  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : fallback
  } catch {
    return fallback
  }
}
