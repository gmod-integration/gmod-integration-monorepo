import { batch, createSignal } from 'solid-js'
import { WEBSITE_CONFIG } from '../config.js'
import { normalizeDiscordUserPayload, setDiscordUser, setIsAdmin, setIsLogged, type DiscordUserState } from './event.js'

export type AuthStatus = 'checking' | 'authenticated' | 'temporarily_unavailable' | 'reauth_required' | 'signed_out'
export type AuthSession = {
  authenticated: true
  user: DiscordUserState & { rank?: string }
  session: { id: string; expiresAt: string; absoluteExpiresAt: string; actorDiscordID?: string }
  csrfToken: string
}
export const AUTH_CHANGE_EVENT = 'gmi:auth-change'
export const AUTH_STORAGE_KEY = 'gmi:auth-event'
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
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ nonce: crypto.randomUUID(), at: Date.now() }))
}

/** The server supplies identity and expiry; browser storage is only a presentation cache. */
export function acceptAuthSession(value: AuthSession) {
  if (authSession() && authSession()!.session.id !== value.session.id) invalidatePendingRequests()
  const previousID = authSession()?.user.id || localStorage.getItem('discordID')
  if (previousID && previousID !== value.user.id) {
    localStorage.removeItem('guilds')
    localStorage.removeItem('server')
  }
  const normalized = { ...normalizeDiscordUserPayload(value.user), rank: value.user.rank }
  localStorage.removeItem('accessToken')
  localStorage.removeItem('expirationDate')
  localStorage.removeItem('oldAccessToken')
  localStorage.removeItem('oldExpirationDate')
  localStorage.removeItem('oldDiscordID')
  localStorage.setItem('discordID', normalized.id)
  localStorage.setItem('discordUser', JSON.stringify(normalized))
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
    localStorage.removeItem(key)
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
      const oldToken = localStorage.getItem('accessToken')
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

/** All authenticated v3/v6 requests use cookies and the same CSRF/session recovery contract. */
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase()
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (mutation && !authSession()?.csrfToken) await refreshAuthSession()
  const headers = new Headers(init.headers)
  if (mutation && authSession()?.csrfToken) headers.set('X-CSRF-Token', authSession()!.csrfToken)
  const current = generation
  const response = await sendAuthenticated(input, { ...init, headers }, current)
  if (response.status === 403) {
    const denied = await response
      .clone()
      .json()
      .catch(() => undefined)
    const code = typeof denied?.error === 'string' ? denied.error : denied?.error?.code
    if (current === generation && code === 'discord_reauth_required') setAuthStatus('reauth_required')
  }
  if (response.status !== 401 || current !== generation) return response
  const before = authSession()?.session.id
  const updated = await refreshAuthSession()
  // GET is safe to retry once. A mutation is never replayed without an idempotency guarantee.
  if (!mutation && updated && updated.session.id === before)
    return sendAuthenticated(input, { ...init, headers: new Headers(init.headers) }, current)
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
    broadcastAuthChange()
    return authSession()!
  }
  throw new Error('Invalid session action acknowledgement')
}

export async function signOut() {
  try {
    const response = await authenticatedFetch(sessionURL('/logout'), { method: 'POST', signal: timeout() })
    if (!response.ok) throw new Error('Logout revocation unconfirmed')
  } finally {
    resetAuthentication()
    broadcastAuthChange()
  }
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
