import { batch } from 'solid-js'
import { normalizeDiscordUserPayload, setDiscordUser, setIsAdmin, setIsLogged } from './event.js'
import { updateNotificationCount } from './notificationStore.js'
import { setWebSocketLogsMessages, setWebSocketServerStatus, setWebSocketSignal, webSocketSignal } from './websocket.js'
import { broadcastAuthChange, resetAuthentication, LOGOUT_PENDING_KEY } from './authClient.js'

export const ERASURE_RECEIPT_KEY = 'account-erasure-receipt'
export type ErasureReceipt = { requestId: string; receipt: string }

/** Remove the signed-in application's data; only preferences and the recovery receipt survive. */
export function clearAccountSession(value?: ErasureReceipt) {
  resetAuthentication()
  // Never remove the recovery credential, even briefly: the session may already be revoked.
  try {
    if (value && localStorage.getItem(ERASURE_RECEIPT_KEY) !== JSON.stringify(value))
      localStorage.setItem(ERASURE_RECEIPT_KEY, JSON.stringify(value))
  } catch {
    /* Receipt persistence is best effort when the browser refuses storage. */
  }
  const preserved = new Set(['locale', 'theme', ERASURE_RECEIPT_KEY, LOGOUT_PENDING_KEY])
  let keys: (string | null)[] = []
  try {
    keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  } catch {
    /* Continue in-memory cleanup. */
  }
  for (const key of keys) {
    if (!key || preserved.has(key)) continue
    try {
      localStorage.removeItem(key)
    } catch {
      /* One refused cache removal must not stop the rest. */
    }
  }
  try {
    sessionStorage.clear()
  } catch {
    /* Session state and socket cleanup remain authoritative locally. */
  }
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
  // Tabs without a live socket must check their cookie after account cleanup too.
  broadcastAuthChange()
}
