/** The API remains authoritative; UI refreshes its access snapshot after relevant events. */
export const ACCESS_REFRESH_EVENT = 'gmi:access-refresh'
export function refreshAccess() {
  window.dispatchEvent(new Event(ACCESS_REFRESH_EVENT))
}
