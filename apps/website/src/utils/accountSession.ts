import { batch } from 'solid-js'
import { normalizeDiscordUserPayload, setDiscordUser, setIsAdmin, setIsLogged } from './event.js'
import { updateNotificationCount } from './notificationStore.js'
import { setWebSocketLogsMessages, setWebSocketServerStatus, setWebSocketSignal, webSocketSignal } from './websocket.js'

export const ERASURE_RECEIPT_KEY = 'account-erasure-receipt'
export type ErasureReceipt = { requestId: string; receipt: string }

/** Remove the signed-in application's data; only preferences and the recovery receipt survive. */
export function clearAccountSession(value?: ErasureReceipt) {
  // Never remove the recovery credential, even briefly: the session may already be revoked.
  if (value && localStorage.getItem(ERASURE_RECEIPT_KEY) !== JSON.stringify(value))
    localStorage.setItem(ERASURE_RECEIPT_KEY, JSON.stringify(value))
  const preserved = new Set(['locale', 'theme', ERASURE_RECEIPT_KEY])
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  for (const key of keys) if (key && !preserved.has(key)) localStorage.removeItem(key)
  sessionStorage.clear()
  const socket = webSocketSignal()
  if (socket) {
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close()
    } catch {
      /* The session is still cleared if the socket has already closed. */
    }
  }
  batch(() => {
    setIsLogged(false)
    setIsAdmin(false)
    setDiscordUser(normalizeDiscordUserPayload({}))
    updateNotificationCount(0)
    setWebSocketSignal(null)
    setWebSocketLogsMessages([])
    setWebSocketServerStatus({
      isWebSocketConnected: false,
      lastRequest: new Date(0),
      version: '',
      versionComparator: 1,
      serverID: '',
      action: 'server_status',
    })
  })
}
