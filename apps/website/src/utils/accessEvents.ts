/** The API remains authoritative; UI refreshes its access snapshot after relevant events. */
export const ACCESS_REFRESH_EVENT = 'gmi:access-refresh'
export function refreshAccess(reason: 'invalidate' | 'background' = 'invalidate') {
  window.dispatchEvent(new CustomEvent(ACCESS_REFRESH_EVENT, { detail: { reason } }))
}
