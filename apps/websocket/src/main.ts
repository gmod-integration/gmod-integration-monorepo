import { WebSocketServer } from 'ws'
import { Worker } from 'bullmq'
import { randomUUID } from 'node:crypto'
import {
  AUTH_SESSION_REVOCATION_CHANNEL,
  assertTrustedOrigin,
  consumeWebSocketTicket,
  validateApplicationSession,
  type AuthSession,
} from '@gmod/domain-auth/authSessions.js'
import { ConfigServer } from '@gmod/config'
import { hasCapability, resolveGuildAccess } from '@gmod/domain-access/index.js'
import { gmLog } from '@gmod/shared/logger.js'
import { getServerFromID, getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { getPanelUserFromDiscordID, type PanelUser } from '@gmod/domain-user/PanelUser.js'
import { isErasureBlocked, PRIVACY_REVOCATION_CHANNEL } from '@gmod/domain-user/privacy.js'
import {
  DISCORD_GUILD_PERMISSIONS_CHANNEL,
  parseDiscordGuildPermissionsInvalidation,
  readDiscordGuildPermissionsRevision,
} from '@gmod/domain-user/guildPermissions.js'
import { getUserGuildsWithPermsForPanel } from '@gmod/domain-guild/discordModels.js'
import { connectPrisma, gracefulShutdownPrisma } from '@gmod/infra-prisma'
import redis, { gracefulShutdownRedis } from '@gmod/infra-redis'
import { lastGmodIntegrationTag, versionComparator } from '@gmod/core/utils/tools.js'
import { ADDON_MAX_FRAME_BYTES, createAddonGateway } from './addonGateway.js'
import { connection } from '@gmod/infra-bullmq'
import { wsSendToServerQueue, wsSendToAllClientsOfServerQueue } from '@gmod/infra-websocket/queues.js'
import { createServerPresence, isServerPresent } from './serverPresence.js'
import { createDashboardMessageBudget } from './dashboardMessageBudget.js'
import { acceptAddonCommandResult } from '@gmod/infra-websocket/addonCommands.js'

interface wsClientClient {
  ws: any
  panelUser: PanelUser
  guildAdminListID: string[]
  serverAdminListID: string[]
  session: AuthSession
  permissionsCheckedAt: number
  permissionsGeneration: number
  permissionsRevision?: string
  permissionsRetryAt?: number
  authorizationRequired?: boolean
  expiryTimer?: ReturnType<typeof setTimeout>
}

interface wsClientServer {
  id: string
  ws: any
  presence: ReturnType<typeof createServerPresence>
}

const clients = {
  server: [] as wsClientServer[],
  client: [] as wsClientClient[],
}

const WS_SEND_TO_SERVER_BROADCAST_CHANNEL = 'ws:send-to-server:broadcast'
const WS_SEND_TO_SERVER_ACK_PREFIX = 'ws:send-to-server:ack:'
const WS_SEND_TO_SERVER_ACK_WAIT_MS = 600
const WS_SEND_TO_SERVER_ACK_TTL_SECONDS = 5
const WS_SEND_TO_SERVER_ACK_POLL_MS = 60

type VerifiedHandshake =
  { kind: 'server'; serverID: string; token: string } | { kind: 'dashboard'; session: AuthSession }
const verifiedHandshakes = new WeakMap<object, VerifiedHandshake>()
const socketStops = new Map<any, () => void>()
const closedSockets = new WeakSet<object>()
const pendingPresenceClosures = new Set<Promise<void>>()
const PERMISSION_RECHECK_MS = 30_000

let inShutdown = false
let wss: WebSocketServer | undefined
let wsSendToServerSubscriber: ReturnType<typeof redis.duplicate> | undefined
let wsSendToServerWorker: Worker | undefined
let wsSendToAllClientsOfServerWorker: Worker | undefined

function closeServerPresence(server: wsClientServer) {
  const closing = server.presence.close().catch(() => {
    gmLog('websocket', 'Server presence cleanup temporarily unavailable', true)
  })
  pendingPresenceClosures.add(closing)
  void closing.then(() => pendingPresenceClosures.delete(closing))
  return closing
}

function getWsSendToServerAckKey(requestId: string) {
  return `${WS_SEND_TO_SERVER_ACK_PREFIX}${requestId}`
}

async function waitForRemoteWsDispatchAck(requestId: string, timeoutMs = WS_SEND_TO_SERVER_ACK_WAIT_MS) {
  const ackKey = getWsSendToServerAckKey(requestId)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const ackCount = Number((await redis.get(ackKey)) || '0')
    if (Number.isFinite(ackCount) && ackCount > 0) {
      await redis.del(ackKey)
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, WS_SEND_TO_SERVER_ACK_POLL_MS))
  }

  await redis.del(ackKey)
  return false
}

async function mayDispatchServerData(id: string, data: any) {
  if (['wsRcon', 'wsAuthorizedRcon'].includes(data?.method)) {
    const server = await getServerFromID(id)
    return !!server && hasCapability(await resolveGuildAccess(server.getGuildID()), 'console.rcon')
  }
  // Recheck paid synchronization when a queued command is dispatched, also on remote instances.
  const restriction =
    data?.method === 'wsSyncName'
      ? { setting: 'sync_pseudo_direction', directions: ['both', 'discord-to-gmod'] }
      : data?.method === 'wsPlayerSay'
        ? { setting: 'syncChatDirection', directions: ['both', 'discordToGmod'] }
        : data?.method === 'wsPlayerUpdateGroup' && data.add === true
          ? { setting: 'sync_role_direction', directions: ['both', 'discord-to-gmod'] }
          : undefined
  if (restriction) {
    const server = await getServerFromID(id)
    if (!server || !restriction.directions.includes(await server.getEffectiveSetting(restriction.setting))) return false
  }
  return true
}

function wsSendToServer(id: string, data: any) {
  const client = clients.server.find((client) => client.id === id)

  if (!client) {
    return false
  }

  const stringData = JSON.stringify(data)

  gmLog(
    'websocket',
    JSON.stringify({
      action: 'command_dispatched',
      serverID: id,
      method: typeof data?.method === 'string' ? data.method.slice(0, 64) : 'unknown',
    }),
  )
  client.ws.send(stringData)

  return true
}

function removeClient(client: wsClientClient) {
  clients.client = clients.client.filter((candidate) => candidate.ws !== client.ws)
  if (client.expiryTimer) clearTimeout(client.expiryTimer)
}

function closeClient(client: wsClientClient, reason = 'Session revoked', code = 1008) {
  closedSockets.add(client.ws)
  removeClient(client)
  socketStops.get(client.ws)?.()
  client.ws.close(code, reason)
}

function isLiveClient(client: wsClientClient) {
  return !inShutdown && clients.client.includes(client) && client.ws.readyState === 1 && !closedSockets.has(client.ws)
}

async function validClient(client: wsClientClient) {
  if (!isLiveClient(client)) return false
  const session = await validateApplicationSession(client.session.id)
  if (!session || session.discordID !== client.panelUser.discordID || (await isErasureBlocked(session.discordID))) {
    closeClient(client)
    return false
  }
  if (!isLiveClient(client)) return false
  client.session = session
  return true
}

function invalidateClientPermissions(client: wsClientClient) {
  client.guildAdminListID = []
  client.serverAdminListID = []
  client.permissionsCheckedAt = 0
  client.permissionsRetryAt = undefined
  client.permissionsRevision = undefined
  client.permissionsGeneration++
}

async function refreshClientPermissions(client: wsClientClient, force = false) {
  try {
    if (!isLiveClient(client)) return false
    const revision = await readDiscordGuildPermissionsRevision(client.panelUser.discordID)
    if (!isLiveClient(client)) return false
    if (client.permissionsRevision !== revision) {
      invalidateClientPermissions(client)
      client.permissionsRevision = revision
    }
    if (client.permissionsRetryAt && Date.now() < client.permissionsRetryAt) return false
    if (!force && Date.now() - client.permissionsCheckedAt < PERMISSION_RECHECK_MS) return true
    const generation = client.permissionsGeneration
    const guilds = await getUserGuildsWithPermsForPanel(client.panelUser)
    const guildIDs: string[] = []
    const serverIDs: string[] = []
    for (const guild of guilds) {
      guildIDs.push(guild.id)
      const servers = await getServersFromDiscordGuildID(guild.id)
      for (const server of servers || []) serverIDs.push(server.id)
    }
    if (!isLiveClient(client) || client.permissionsGeneration !== generation) return false
    if (
      (await readDiscordGuildPermissionsRevision(client.panelUser.discordID)) !== revision ||
      client.permissionsGeneration !== generation ||
      !isLiveClient(client)
    ) {
      invalidateClientPermissions(client)
      return false
    }
    client.guildAdminListID = guildIDs
    client.serverAdminListID = serverIDs
    client.permissionsCheckedAt = Date.now()
    client.permissionsRetryAt = undefined
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['discord_reauth_required', 'grant_rejected'].includes(String(error.code))
    ) {
      client.authorizationRequired = true
      closeClient(client, 'Discord authorization required', 4003)
      return false
    }
    // A provider outage does not log the user out or preserve an authorization we cannot revalidate.
    client.guildAdminListID = []
    client.serverAdminListID = []
    client.permissionsCheckedAt = 0
    client.permissionsRetryAt = Date.now() + 5_000
    return false
  }
}

function scheduleSessionCheck(client: wsClientClient) {
  const delay = Math.max(1, Math.min(60_000, client.session.expiresAt.getTime() - Date.now()))
  client.expiryTimer = setTimeout(async () => {
    try {
      if (await validClient(client)) scheduleSessionCheck(client)
    } catch {
      closeClient(client, 'Session unavailable', 1013)
    }
  }, delay)
  client.expiryTimer.unref?.()
}

function startHeartbeat(ws: any) {
  let alive = true
  const onPong = () => {
    alive = true
  }
  ws.on('pong', onPong)
  const timer = setInterval(() => {
    if (ws.readyState !== 1) return
    if (!alive) {
      stop()
      if (typeof ws.terminate === 'function') ws.terminate()
      else ws.close(1001, 'Heartbeat timeout')
      return
    }
    alive = false
    try {
      ws.ping()
    } catch {
      stop()
      ws.close()
    }
  }, 30_000)
  timer.unref?.()
  const stop = () => {
    clearInterval(timer)
    ws.removeListener('pong', onPong)
    socketStops.delete(ws)
  }
  socketStops.set(ws, stop)
  ws.once('close', stop)
}

async function wsSendToClient(client: wsClientClient, data: any) {
  if (!(await validClient(client))) return false
  if (
    data.action !== 'error' &&
    typeof data.serverID === 'string' &&
    (!(await refreshClientPermissions(client)) || !client.serverAdminListID.includes(data.serverID))
  )
    return false
  if (!isLiveClient(client)) return false
  client.ws.send(JSON.stringify(data))
  return true
}

async function wsSendToAllClientsOfServer(serverID: string, action: string, data: any) {
  for (const client of [...clients.client]) {
    try {
      if (!(await validClient(client)) || !(await refreshClientPermissions(client))) continue
      if (!client.serverAdminListID.includes(serverID)) continue
      await wsSendToClient(client, { action, serverID, data })
    } catch {
      // Delivery never uses stale permissions when session storage or Discord is unavailable.
      gmLog('websocket', 'Client delivery temporarily unavailable', true)
    }
  }
  return true
}

export async function gracefulShutdown() {
  if (inShutdown) return
  inShutdown = true

  gmLog('shutdown', 'Gracefully shutting down websocket app...')

  for (const stop of socketStops.values()) stop()
  for (const client of clients.client) {
    clearTimeout(client.expiryTimer)
    client.ws.close(1001, 'Service restarting')
  }
  for (const server of clients.server) {
    server.ws.close(1001, 'Service restarting')
    void closeServerPresence(server)
  }
  clients.server = []
  await Promise.all(pendingPresenceClosures)

  await wsSendToServerWorker?.close()
  await wsSendToAllClientsOfServerWorker?.close()
  await wsSendToServerSubscriber?.unsubscribe(WS_SEND_TO_SERVER_BROADCAST_CHANNEL).catch(() => {})
  await wsSendToServerSubscriber?.quit().catch(() => {})

  await new Promise<void>((resolve) => {
    if (!wss) {
      resolve()
      return
    }
    wss.close(() => resolve())
  })

  await gracefulShutdownRedis()
  await gracefulShutdownPrisma()
  process.exit(0)
}

export async function main() {
  await connectPrisma()

  wsSendToServerSubscriber = redis.duplicate()
  wsSendToServerSubscriber.on('error', (error) => {
    gmLog('websocket', `Subscriber error: ${error.message}`, true)
  })

  wsSendToServerSubscriber.on('message', async (channel, payload) => {
    if (channel === DISCORD_GUILD_PERMISSIONS_CHANNEL) {
      const invalidation = parseDiscordGuildPermissionsInvalidation(payload)
      if (!invalidation) return
      for (const client of clients.client) {
        // Guild-wide changes can grant rights to a member absent from the previous admin list.
        if (!invalidation.discordID || client.panelUser.discordID === invalidation.discordID)
          invalidateClientPermissions(client)
      }
      return
    }
    if (channel === AUTH_SESSION_REVOCATION_CHANNEL) {
      try {
        const { sessionID } = JSON.parse(payload)
        if (typeof sessionID !== 'string') return
        for (const client of [...clients.client])
          if (client.session.id === sessionID || client.session.actorSessionID === sessionID) closeClient(client)
      } catch {
        gmLog('websocket', 'Invalid session revocation message', true)
      }
      return
    }
    if (channel === PRIVACY_REVOCATION_CHANNEL) {
      try {
        const { discordID } = JSON.parse(payload)
        if (typeof discordID !== 'string') return
        const revoked = clients.client.filter(
          (client) => client.panelUser.discordID === discordID || client.session.actorDiscordID === discordID,
        )
        for (const client of revoked) closeClient(client)
      } catch {
        gmLog('websocket', 'Invalid privacy revocation message', true)
      }
      return
    }
    if (channel !== WS_SEND_TO_SERVER_BROADCAST_CHANNEL) {
      return
    }

    try {
      const parsed = JSON.parse(payload)
      const serverID = parsed?.id
      const messageData = parsed?.data
      const requestId = parsed?.requestId

      if (!serverID || !requestId) {
        return
      }

      if (!(await mayDispatchServerData(serverID, messageData))) return
      const sent = wsSendToServer(serverID, messageData)
      if (!sent) {
        return
      }

      const ackKey = getWsSendToServerAckKey(requestId)
      await redis.incr(ackKey)
      await redis.expire(ackKey, WS_SEND_TO_SERVER_ACK_TTL_SECONDS)
    } catch (error: any) {
      gmLog('websocket', `Failed to process remote ws dispatch payload: ${error.message}`, true)
    }
  })

  await wsSendToServerSubscriber.subscribe(WS_SEND_TO_SERVER_BROADCAST_CHANNEL)
  await wsSendToServerSubscriber.subscribe(PRIVACY_REVOCATION_CHANNEL)
  await wsSendToServerSubscriber.subscribe(AUTH_SESSION_REVOCATION_CHANNEL)
  await wsSendToServerSubscriber.subscribe(DISCORD_GUILD_PERMISSIONS_CHANNEL)

  wss = new WebSocketServer({
    maxPayload: ADDON_MAX_FRAME_BYTES,
    port: ConfigServer.ports.websocket,
    clientTracking: true,
    verifyClient: async (info, cb) => {
      const { id, token } = info.req.headers

      if (id !== undefined || token !== undefined) {
        if (typeof id !== 'string' || !id || typeof token !== 'string' || !token) return cb(false, 401, 'Unauthorized')
        try {
          const server = await getServerFromID(id)
          if (!server || !server.isValidToken(token)) return cb(false, 401, 'Unauthorized')
          verifiedHandshakes.set(info.req, { kind: 'server', serverID: id, token })
          gmLog('websocket', 'Authorized server ' + id)
          return cb(true)
        } catch {
          return cb(false, 503, 'Server authentication unavailable')
        }
      }

      try {
        try {
          assertTrustedOrigin(info.req)
        } catch {
          return cb(false, 403, 'Forbidden')
        }
        const ticket = new URL(info.req.url || '/', 'http://localhost').searchParams.get('ticket')
        if (ticket) {
          const session = await consumeWebSocketTicket(ticket)
          if (session) {
            verifiedHandshakes.set(info.req, { kind: 'dashboard', session })
            return cb(true)
          }
        }
      } catch {
        return cb(false, 503, 'Session unavailable')
      }

      gmLog('websocket', 'Unauthorized connection')

      return cb(false, 401, 'Unauthorized')
    },
  })

  wss.on('connection', async function connectionWS(ws, req) {
    ws.once('close', () => closedSockets.add(ws))
    if (inShutdown) {
      ws.close(1001, 'Service restarting')
      return
    }
    const verified = verifiedHandshakes.get(req)
    verifiedHandshakes.delete(req)
    if (!verified) {
      ws.close(1008, 'Session required')
      return
    }

    if (verified.kind === 'server') {
      const id = verified.serverID
      const existingClient = clients.server.find((client) => client.id === id)
      if (existingClient) {
        void closeServerPresence(existingClient)
        try {
          existingClient.ws.close()
        } catch {
          // ignore socket close errors
        }
        clients.server = clients.server.filter((client) => client.id !== id)
      }

      const client: wsClientServer = { id, ws, presence: createServerPresence(id, randomUUID()) }
      clients.server.push(client)
      gmLog('websocket', 'Server connected: ' + id)

      const refreshPresence = () => {
        void client.presence.refresh().catch(() => {
          gmLog('websocket', 'Server presence renewal temporarily unavailable', true)
          ws.close(1013, 'Presence unavailable')
        })
      }
      ws.on('pong', refreshPresence)

      ws.on('close', () => {
        clients.server = clients.server.filter((client) => client.ws !== ws)
        ws.removeListener('pong', refreshPresence)
        void closeServerPresence(client)
        gmLog('websocket', 'Server disconnected: ' + id)
      })

      const addon = createAddonGateway({
        socket: ws,
        serverID: id,
        authenticate: async () => {
          const server = await getServerFromID(id)
          return server?.isValidToken(verified.token) ? server : undefined
        },
        onActivity: async () => {
          const version = req.headers['gmod-integrations-version']
          if (
            typeof version === 'string' &&
            /^v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version) &&
            version.length <= 64
          )
            await redis.set(`server:${id}:version`, version)
          await redis.set(`server:${id}:last_request`, new Date().toISOString())
        },
        onConsole: async (text) => {
          const server = await getServerFromID(id)
          if (!server || !hasCapability(await resolveGuildAccess(server.getGuildID()), 'console.rcon')) return
          await wsSendToAllClientsOfServerQueue.add('wsSendToAllClientsOfServer', {
            id,
            action: 'console_live_exporter',
            data: { data: text },
          })
        },
        onCommandResult: (packet) => acceptAddonCommandResult(id, packet),
      })
      ws.on('message', (message: Buffer, binary: boolean) => addon.receive(message, binary))
      ws.once('close', () => addon.close())
      try {
        await client.presence.refresh()
      } catch {
        clients.server = clients.server.filter((candidate) => candidate !== client)
        await closeServerPresence(client)
        ws.close(1013, 'Presence unavailable')
        return
      }
      // A close, replacement or shutdown may have happened while Redis was registering the lease.
      if (!clients.server.includes(client)) return
      addon.ready()
    } else {
      const session = verified.session
      try {
        const user = await getPanelUserFromDiscordID(session.discordID, undefined, session)
        if (inShutdown || ws.readyState !== 1 || closedSockets.has(ws)) return
        if (!user) {
          ws.close(1008, 'Session revoked')
          return
        }
        const client: wsClientClient = {
          ws,
          panelUser: user,
          session,
          guildAdminListID: [],
          serverAdminListID: [],
          permissionsCheckedAt: 0,
          permissionsGeneration: 0,
        }
        clients.client.push(client)
        ws.on('close', () => {
          removeClient(client)
          gmLog('websocket', 'Client disconnected: ' + session.discordID)
        })
        if (!(await refreshClientPermissions(client, true))) {
          if (!client.authorizationRequired && ws.readyState === 1 && !closedSockets.has(ws))
            closeClient(client, 'Permissions unavailable', 1013)
          return
        }
        if (!(await validClient(client)) || inShutdown) return
        scheduleSessionCheck(client)
        gmLog('websocket', 'Client connected: ' + session.discordID)

        const messageBudget = createDashboardMessageBudget()
        ws.on('message', async (message: Buffer | string, binary = false) => {
          const decision = binary ? 'rejected' : messageBudget.enter(message)
          if (decision === 'busy') return
          if (decision === 'rejected') {
            closeClient(client, 'Message budget exceeded', 1008)
            return
          }
          try {
            const info = JSON.parse(message.toString())
            if (!info || typeof info !== 'object' || !info.action) return
            if (!(await validClient(client))) return
            if (info.action === 'server_status') {
              const serverID = info.data?.serverID
              if (
                typeof serverID !== 'string' ||
                !/^[a-zA-Z0-9_-]{1,255}$/.test(serverID) ||
                !(await refreshClientPermissions(client))
              )
                return
              if (!client.serverAdminListID.includes(serverID)) {
                await wsSendToClient(client, { action: 'error', error: 'forbidden', serverID })
                return
              }
              const [version, lastRequest, connected] = await Promise.all([
                redis.get(`server:${serverID}:version`),
                redis.get(`server:${serverID}:last_request`),
                isServerPresent(serverID),
              ])
              await wsSendToClient(client, {
                action: 'server_status',
                serverID,
                version,
                versionComparator: version ? versionComparator(lastGmodIntegrationTag, version) : 1,
                lastRequest: lastRequest ? new Date(lastRequest) : new Date(Date.now() - 120_000),
                isWebSocketConnected: connected,
              })
            }
          } catch {
            gmLog('websocket', 'Error processing client message', true)
          } finally {
            messageBudget.release()
          }
        })
      } catch {
        ws.close(1013, 'Session temporarily unavailable')
        return
      }
    }
    if (!inShutdown && ws.readyState === 1 && !closedSockets.has(ws)) startHeartbeat(ws)
  })

  wsSendToServerWorker = new Worker(
    wsSendToServerQueue.name,
    async (job) => {
      if (!(await mayDispatchServerData(job.data.id, job.data.data))) return false
      const sentLocally = wsSendToServer(job.data.id, job.data.data)
      if (sentLocally) {
        return true
      }

      const requestId = randomUUID()
      const ackKey = getWsSendToServerAckKey(requestId)
      await redis.set(ackKey, '0', 'EX', WS_SEND_TO_SERVER_ACK_TTL_SECONDS)
      await redis.publish(
        WS_SEND_TO_SERVER_BROADCAST_CHANNEL,
        JSON.stringify({
          id: job.data.id,
          data: job.data.data,
          requestId,
        }),
      )

      return await waitForRemoteWsDispatchAck(requestId)
    },
    {
      connection,
    },
  )

  wsSendToAllClientsOfServerWorker = new Worker(
    wsSendToAllClientsOfServerQueue.name,
    async (job) => {
      await wsSendToAllClientsOfServer(job.data.id, job.data.action, job.data.data)
    },
    {
      connection,
    },
  )

  gmLog('websocket', 'Listening on port ' + ConfigServer.ports.websocket)

  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}
