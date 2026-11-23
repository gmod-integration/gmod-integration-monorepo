import { refreshAccess } from './accessEvents.js'
import { isLogged } from './event'
import { authenticatedFetch, authSession, authStatus, refreshAuthSession, setAuthStatus } from './authClient.js'
import { createSignal } from 'solid-js'
import { getUrlWithActualParams } from './api'
import { WEBSITE_CONFIG } from '../config'

const wsBaseUrl = WEBSITE_CONFIG.wsUrl

export const [webSocketSignal, setWebSocketSignal] = createSignal<WebSocket | null>(null)
export const [webSocketLogsMessages, setWebSocketLogsMessages] = createSignal([] as any[])
type ServerStatus = {
  isWebSocketConnected: boolean
  lastRequest: Date
  version: string
  versionComparator: number
  serverID: string
  action: string
}
const unverifiedServerStatus = (): ServerStatus => ({
  isWebSocketConnected: false,
  lastRequest: new Date(0),
  version: '',
  versionComparator: 1,
  serverID: '',
  action: 'server_status',
})
export const [webSocketServerStatus, setWebSocketServerStatus] = createSignal(unverifiedServerStatus())

let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let stableConnectionTimer: ReturnType<typeof setTimeout> | undefined
let attempt = 0
let stopped = true
let generation = 0
let connecting: Promise<void> | undefined
let connectedSessionID: string | undefined

export function websocket(params: Array<string> = [], ticket?: string) {
  const url = new URL(wsBaseUrl)
  url.searchParams.set('action', 'main')
  if (ticket) url.searchParams.set('ticket', ticket)
  url.searchParams.set('guildID', getUrlWithActualParams(':guildID'))
  url.searchParams.set('serverID', getUrlWithActualParams(':serverID'))
  for (const value of params) {
    const entry = new URLSearchParams(value)
    for (const [key, item] of entry) if (key !== 'token' && key !== 'discordID') url.searchParams.set(key, item)
  }
  return url.toString()
}

export function stopWebSocket() {
  stopped = true
  generation++
  connecting = undefined
  connectedSessionID = undefined
  clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  clearTimeout(stableConnectionTimer)
  stableConnectionTimer = undefined
  attempt = 0
  const previous = webSocketSignal()
  setWebSocketSignal(null)
  setWebSocketServerStatus(unverifiedServerStatus())
  if (previous) {
    previous.onclose = null
    previous.onmessage = null
    previous.onerror = null
    try {
      previous.close()
    } catch {
      /* An already closed transport needs no further cleanup. */
    }
  }
}

function reconnect() {
  if (stopped || !isLogged() || authStatus() === 'reauth_required' || reconnectTimer) return
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5)) + Math.random() * 500
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    void initWebSocket()
  }, delay)
}

/** A fresh single-use handshake ticket is requested for each connection attempt. */
export async function initWebSocket(forceClose = false) {
  if (!isLogged() || authStatus() === 'reauth_required') return
  const sessionID = authSession()?.session.id
  if (forceClose || (connectedSessionID && sessionID !== connectedSessionID)) stopWebSocket()
  stopped = false
  const existing = webSocketSignal()
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return
  if (connecting) return connecting
  if (reconnectTimer) return
  setWebSocketServerStatus(unverifiedServerStatus())
  clearTimeout(stableConnectionTimer)
  stableConnectionTimer = undefined
  const current = generation
  // The pending ticket belongs to this identity too, before a socket exists.
  connectedSessionID = sessionID
  const operation = (async () => {
    try {
      const response = await authenticatedFetch(`${WEBSITE_CONFIG.apiUrl}/v6/auth/ws-ticket`, {
        method: 'POST',
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) throw new Error('WebSocket ticket unavailable')
      const value: unknown = await response.json()
      if (
        !value ||
        typeof value !== 'object' ||
        !('ticket' in value) ||
        typeof value.ticket !== 'string' ||
        !value.ticket
      )
        throw new Error('Invalid WebSocket ticket')
      if (current !== generation || stopped || !isLogged() || sessionID !== authSession()?.session.id) return
      const ws = new WebSocket(websocket([], value.ticket))
      connectedSessionID = authSession()?.session.id
      setWebSocketSignal(ws)
      ws.onopen = () => {
        if (current !== generation || webSocketSignal() !== ws) {
          ws.close()
          return
        }
        // The upgrade can open before backend permission checks close a rejected connection.
        stableConnectionTimer = setTimeout(() => {
          if (current !== generation || stopped || webSocketSignal() !== ws || ws.readyState !== WebSocket.OPEN) return
          stableConnectionTimer = undefined
          attempt = 0
        }, 10_000)
        refreshAccess('background')
      }
      ws.onmessage = (event) => {
        if (current !== generation || webSocketSignal() !== ws) return
        try {
          const data = JSON.parse(event.data)
          if (!data || !data.action) return
          if (data.action === 'access_changed') refreshAccess()
          else if (data.serverID === getUrlWithActualParams(':serverID')) {
            if (data.action === 'server_logs') setWebSocketLogsMessages((previous) => [data.data, ...previous])
            else if (data.action === 'server_status') {
              data.lastRequest = new Date(data.lastRequest)
              setWebSocketServerStatus(data)
            } else if (data.action === 'error') setWebSocketServerStatus(unverifiedServerStatus())
          }
        } catch {
          /* Malformed live updates do not invalidate the application session. */
        }
      }
      ws.onclose = async (event) => {
        if (current !== generation || stopped || webSocketSignal() !== ws) return
        clearTimeout(stableConnectionTimer)
        stableConnectionTimer = undefined
        setWebSocketSignal(null)
        setWebSocketServerStatus(unverifiedServerStatus())
        if (event.code === 4003) {
          stopWebSocket()
          setAuthStatus('reauth_required')
          return
        }
        if (event.code === 1008 || event.code === 4401) await refreshAuthSession()
        if (current !== generation || stopped) return
        if (authStatus() !== 'signed_out') reconnect()
      }
      ws.onerror = () => {
        /* The close event schedules a bounded reconnect. */
      }
    } catch {
      if (current === generation && authStatus() !== 'signed_out') reconnect()
    }
  })()
  connecting = operation
  try {
    await operation
  } finally {
    if (connecting === operation) connecting = undefined
  }
}

export function sendWebSocketMessage(event: string, data: any) {
  const ws = webSocketSignal()
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify({ action: event, data }))
  return true
}

const lastServerStatusRequests = new WeakMap<WebSocket, Map<string, number>>()

/** Share status polling between connection details and dependency guidance. */
export function requestServerStatus(serverID: string | undefined) {
  const ws = webSocketSignal()
  if (!serverID || !/^[\w-]{1,255}$/.test(serverID) || !ws || ws.readyState !== WebSocket.OPEN) return false
  const now = Date.now()
  const requests = lastServerStatusRequests.get(ws) ?? new Map<string, number>()
  const previous = requests.get(serverID)
  if (previous !== undefined && now >= previous && now - previous < 1_500) return false
  try {
    if (!sendWebSocketMessage('server_status', { serverID })) return false
    requests.set(serverID, now)
    lastServerStatusRequests.set(ws, requests)
    return true
  } catch {
    // The transport can close between checking its state and sending the request.
    return false
  }
}
