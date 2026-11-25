import { createHash, randomUUID } from 'node:crypto'
import type { Server } from '@gmod/domain-server/Server.js'
import type { AddonRequest, AddonResult } from '@gmod/core/models/gmod/addonTransport.js'
import { AddonCommandResultSchema, type AddonCommandResult } from '@gmod/schema/gmod/AddonTransportSchema.js'
import { createConsoleChunkQueue } from './consoleStreams.js'

// Also configured on WebSocketServer so oversized frames are rejected before JSON parsing.
export const ADDON_MAX_FRAME_BYTES = 12 * 1024 * 1024
const MAX_ACTIVE_REQUESTS = 4
const MAX_ACTIVE_BYTES = 24 * 1024 * 1024
const MAX_RECENT_REQUESTS = 128
const RECENT_REQUEST_TTL_MS = 120_000
const REQUEST_WINDOW_MS = 10_000
const MAX_REQUESTS_PER_WINDOW = 600
const LEGACY_LOCAL_SETTINGS = new Set([
  'id',
  'token',
  'apiFQDN',
  'websocketFQDN',
  'version',
  'websocket',
  'upgradeSyncConfig',
])

interface AddonSocket {
  readyState: number
  bufferedAmount?: number
  send(data: string): unknown
  close(code: number, reason: string): unknown
}

interface AddonGatewayOptions {
  socket: AddonSocket
  serverID: string
  authenticate: () => Promise<Server | undefined>
  onActivity?: (activity: { protocol?: 'legacy' | 'acknowledged'; countRequest: boolean }) => Promise<void>
  onConsole?: (text: string) => Promise<void>
  onCommandResult?: (packet: AddonCommandResult) => Promise<void>
  dispatch?: (server: Server, request: AddonRequest) => Promise<AddonResult>
  now?: () => number
  timeoutMs?: number
}

interface RecentRequest {
  fingerprint: string
  createdAt: number
  pending: boolean
  response: Promise<AddonResult>
}

/** One authenticated addon connection. It never routes a request through the HTTP application. */
export function createAddonGateway(options: AddonGatewayOptions) {
  const now = options.now ?? Date.now
  const recent = new Map<string, RecentRequest>()
  const queueConsole = createConsoleChunkQueue()
  let closed = false
  let ready = false
  let active = 0
  let activeBytes = 0
  let authenticating = 0
  let windowStart = now()
  let windowRequests = 0
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>()
  const terminate = (code: number, reason: string) => {
    closed = true
    ready = false
    options.socket.close(code, reason)
  }
  const send = (packet: unknown) => {
    if (closed || options.socket.readyState !== 1) return
    try {
      const encoded = JSON.stringify(packet)
      if (
        Buffer.byteLength(encoded) > ADDON_MAX_FRAME_BYTES ||
        (options.socket.bufferedAmount ?? 0) > MAX_ACTIVE_BYTES
      ) {
        terminate(1009, 'Response too large')
        return
      }
      options.socket.send(encoded)
    } catch {
      // The peer may close while an accepted request is finishing.
    }
  }
  const reply = (id: string, result: AddonResult) => send({ action: 'addon.response', id, ...result })
  const failure = (status: number, error: string): AddonResult => ({ status, body: { error } })
  const consume = () => {
    if (now() - windowStart >= REQUEST_WINDOW_MS) {
      windowStart = now()
      windowRequests = 0
    }
    return ++windowRequests <= MAX_REQUESTS_PER_WINDOW
  }
  const authenticate = async () => {
    if (authenticating >= MAX_ACTIVE_REQUESTS) return undefined
    authenticating++
    try {
      const server = await options.authenticate()
      if (!server || String(server.getID()) !== options.serverID) {
        terminate(1008, 'Server credentials revoked')
        return undefined
      }
      return server
    } finally {
      authenticating--
    }
  }
  const prune = () => {
    for (const [id, entry] of recent) {
      if (!entry.pending && now() - entry.createdAt > RECENT_REQUEST_TTL_MS) recent.delete(id)
    }
    if (recent.size >= MAX_RECENT_REQUESTS) {
      for (const [id, entry] of recent) {
        if (!entry.pending) {
          recent.delete(id)
          break
        }
      }
    }
  }

  async function receive(raw: Buffer | string, binary = false): Promise<void> {
    if (closed || options.socket.readyState !== 1) return
    if (binary || Buffer.byteLength(raw) > ADDON_MAX_FRAME_BYTES) {
      terminate(binary ? 1003 : 1009, 'Invalid addon frame')
      return
    }
    if (!consume()) {
      terminate(1008, 'Addon request rate exceeded')
      return
    }
    let packet: Record<string, unknown>
    try {
      packet = JSON.parse(raw.toString())
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('Invalid frame')
    } catch {
      terminate(1007, 'Invalid addon JSON')
      return
    }
    // Older installations only send config updates on the socket. Keep that narrow compatibility
    // path behind the same authenticated dispatcher while they move to the acknowledged protocol.
    const legacyConfig = packet.action === 'save_config' || packet.method === 'config_save'
    if (legacyConfig) {
      const settings = packet.config ?? (packet.data as { data?: unknown } | undefined)?.data
      packet = {
        action: 'addon.request',
        id: `legacy-${randomUUID()}`,
        method: 'POST',
        endpoint: `/servers/${options.serverID}/config`,
        body:
          settings && typeof settings === 'object' && !Array.isArray(settings)
            ? Object.fromEntries(Object.entries(settings).filter(([key]) => !LEGACY_LOCAL_SETTINGS.has(key)))
            : settings,
      }
    }
    if (packet.action === 'console_live_exporter' || packet.method === 'console_live_exporter') {
      const text = (packet.data as { data?: unknown } | undefined)?.data
      if (!ready || typeof text !== 'string' || text.length > 32_768 || !options.onConsole) return
      return queueConsole(text, async () => {
        if (closed || !ready || options.socket.readyState !== 1) return
        try {
          if (await authenticate()) {
            await options.onActivity?.({ countRequest: false })
            await options.onConsole!(text)
          }
        } catch {
          terminate(1013, 'Server verification unavailable')
        }
      })
    }
    if (packet.action === 'addon.command-result') {
      if (!ready || !options.onCommandResult) return
      const parsed = AddonCommandResultSchema.safeParse(packet)
      if (!parsed.success) return
      try {
        if (await authenticate()) {
          await options.onActivity?.({ protocol: 'acknowledged', countRequest: false })
          await options.onCommandResult(parsed.data)
        }
      } catch {
        terminate(1013, 'Server verification unavailable')
      }
      return
    }
    if (packet.action !== 'addon.request') return
    const id = typeof packet.id === 'string' && /^[a-zA-Z0-9_.:-]{1,96}$/.test(packet.id) ? packet.id : undefined
    if (!id) {
      terminate(1008, 'Invalid addon request ID')
      return
    }
    if (!ready) return reply(id, failure(503, 'connection_not_ready'))
    if (authenticating >= MAX_ACTIVE_REQUESTS) return reply(id, failure(429, 'too_many_requests'))
    try {
      // Lazy loading keeps the gateway bootstrap independent of the feature models and their stores.
      const { AddonRequestSchema, handleAddonRequest } = await import('@gmod/core/models/gmod/addonTransport.js')
      const parsed = AddonRequestSchema.safeParse(packet)
      if (!parsed.success) return reply(id, failure(400, 'invalid_request'))
      if (authenticating >= MAX_ACTIVE_REQUESTS) return reply(id, failure(429, 'too_many_requests'))
      const server = await authenticate()
      if (!server || closed) return
      const fingerprint = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex')
      let previous = recent.get(id)
      if (previous && !previous.pending && now() - previous.createdAt > RECENT_REQUEST_TTL_MS) {
        recent.delete(id)
        previous = undefined
      }
      if (previous) {
        return reply(
          id,
          previous.fingerprint === fingerprint ? await previous.response : failure(409, 'request_id_reused'),
        )
      }
      const bytes = Buffer.byteLength(raw)
      if (active >= MAX_ACTIVE_REQUESTS || activeBytes + bytes > MAX_ACTIVE_BYTES)
        return reply(id, failure(429, 'too_many_requests'))
      // At most four entries can be pending. A full 128-entry cache therefore always has
      // a settled entry to evict before this insertion; pending mutations are never evicted.
      prune()
      active++
      activeBytes += bytes
      const entry: RecentRequest = {
        fingerprint,
        createdAt: now(),
        pending: true,
        response: Promise.resolve(failure(500, 'request_failed')),
      }
      // Reserve the ID synchronously before dispatch, including when a duplicate arrives in flight.
      recent.set(id, entry)
      entry.response = new Promise<AddonResult>((resolve) => {
        const timeout = setTimeout(() => {
          timers.delete(timeout)
          resolve(failure(504, 'delivery_uncertain'))
        }, options.timeoutMs ?? 25_000)
        timers.set(timeout, () => resolve(failure(503, 'connection_closed')))
        // The timer exists before work is queued. Timeout/disconnect settles only the reply;
        // reservations remain held until the actual operation finishes, even after uncertainty.
        void Promise.resolve()
          .then(async () => {
            await options.onActivity?.({ protocol: legacyConfig ? 'legacy' : 'acknowledged', countRequest: true })
            return (options.dispatch ?? handleAddonRequest)(server, parsed.data)
          })
          .catch(() => failure(500, 'request_failed'))
          .finally(() => {
            active--
            activeBytes -= bytes
            entry.pending = false
            clearTimeout(timeout)
            timers.delete(timeout)
          })
          .then(resolve)
      })
      reply(id, await entry.response)
    } catch {
      reply(id, failure(503, 'service_unavailable'))
    }
  }

  return {
    receive,
    ready() {
      if (closed) return
      ready = true
      send({ action: 'addon.ready', protocol: 1 })
    },
    close() {
      closed = true
      ready = false
      for (const [timer, cancel] of timers) {
        clearTimeout(timer)
        cancel()
      }
      timers.clear()
      recent.clear()
    },
  }
}
