import {
  DashboardAccessDenialReasonSchema,
  type DashboardAccessDenialReason,
} from '@gmod/schema/user/DashboardAccessSchema.js'
import { WEBSITE_CONFIG } from '../config.js'

/** The API remains authoritative; UI refreshes its access snapshot after relevant events. */
export const ACCESS_REFRESH_EVENT = 'gmi:access-refresh'
export function refreshAccess(reason: 'invalidate' | 'background' = 'invalidate') {
  window.dispatchEvent(new CustomEvent(ACCESS_REFRESH_EVENT, { detail: { reason } }))
}

export const DASHBOARD_ACCESS_DENIED_EVENT = 'gmi:dashboard-access-denied'
export type DashboardAccessDeniedEvent = {
  guildID: string
  serverID?: string
  reason: DashboardAccessDenialReason
  sessionID?: string
}

/** Carry only the authenticated request scope and a public reason, never the response's message. */
export function notifyDashboardAccessDenied(requestURL: string, body: unknown, sessionID?: string): void {
  if (!body || typeof body !== 'object') return
  const error = (body as { error?: unknown }).error
  const code = typeof error === 'string' ? error : (error as { code?: unknown } | null)?.code
  if (code !== 'dashboard_access_denied') return
  const parsed = DashboardAccessDenialReasonSchema.safeParse(
    typeof error === 'string' ? (body as { reason?: unknown }).reason : (error as { reason?: unknown } | null)?.reason,
  )
  if (!parsed.success) return
  try {
    const url = new URL(requestURL, window.location.href)
    const apiOrigin = new URL(WEBSITE_CONFIG.apiUrl, window.location.href).origin
    if (!['http:', 'https:'].includes(url.protocol) || ![apiOrigin, window.location.origin].includes(url.origin)) return
    const path = url.pathname
    if (path.includes('//')) return
    const match = /^\/(?:v6|v3\/users\/([^/]+))\/guilds\/([^/]+)(?:\/servers\/([^/]+))?(?:\/|$)/.exec(path)
    if (!match) return
    const actorID = match[1] ? decodeURIComponent(match[1]) : undefined
    const guildID = decodeURIComponent(match[2])
    const serverID = match[3] ? decodeURIComponent(match[3]) : undefined
    if (
      ![guildID, ...(serverID ? [serverID] : []), ...(actorID ? [actorID] : [])].every((id) =>
        /^[a-zA-Z0-9_-]{1,255}$/.test(id),
      )
    )
      return
    window.dispatchEvent(
      new CustomEvent<DashboardAccessDeniedEvent>(DASHBOARD_ACCESS_DENIED_EVENT, {
        detail: { guildID, serverID, reason: parsed.data, sessionID },
      }),
    )
  } catch {
    // Malformed or unrelated paths cannot replace the active dashboard's permission state.
  }
}
