import { WebSocketServer } from 'ws'
import { Worker } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { ConfigServer } from '@gmod/config'
import { gmLog } from '@gmod/core/utils/logger.js'
import { getServerFromID, getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { getPanelUserFromDiscordID, type PanelUser } from '@gmod/domain-user/PanelUser.js'
import { getUserGuildsWithPermsForPanel } from '@gmod/domain-guild/discordModels.js'
import { connectPrisma, gracefulShutdownPrisma } from '@gmod/infra-prisma'
import redis, { gracefulShutdownRedis } from '@gmod/infra-redis'
import { lastGmodIntegrationTag, versionComparator } from '@gmod/core/utils/tools.js'
import { connection } from '@gmod/infra-bullmq'
import {
  type WSSendToServerData,
  type wsSendToAllClientsOfServerData,
  wsSendToServerQueue,
  wsSendToAllClientsOfServerQueue,
} from '@gmod/infra-websocket/queues.js'

interface wsClientClient {
  ws: any
  panelUser: PanelUser
  guildAdminListID: string[]
  serverAdminListID: string[]
}

interface wsClientServer {
  id: string
  ws: any
}

await connectPrisma()

const clients = {
  server: [] as wsClientServer[],
  client: [] as wsClientClient[],
}

const WS_SEND_TO_SERVER_BROADCAST_CHANNEL = 'ws:send-to-server:broadcast'
const WS_SEND_TO_SERVER_ACK_PREFIX = 'ws:send-to-server:ack:'
const WS_SEND_TO_SERVER_ACK_WAIT_MS = 600
const WS_SEND_TO_SERVER_ACK_TTL_SECONDS = 5
const WS_SEND_TO_SERVER_ACK_POLL_MS = 60

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

const wsSendToServerSubscriber = redis.duplicate()
wsSendToServerSubscriber.on('error', (error) => {
  gmLog('websocket', `Subscriber error: ${error.message}`, true)
})

wsSendToServerSubscriber.on('message', async (channel, payload) => {
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

const wss = new WebSocketServer({
  port: ConfigServer.ports.websocket,
  clientTracking: true,
  verifyClient: async (info, cb) => {
    const { id, token } = info.req.headers

    if (id && token) {
      const server = await getServerFromID(id as string)
      if (server && server.isValidToken(token as string)) {
        gmLog('websocket', 'Authorized server ' + id)
        return cb(true)
      }
    }

    if (info.req.url && info.req.url.includes('discordID') && info.req.url.includes('token')) {
      const args = new URLSearchParams(info.req.url.split('?')[1].split('/').join('&'))
      const authToken = args.get('token')
      const discordID = args.get('discordID')

      if (discordID && authToken) {
        const user = await getPanelUserFromDiscordID(discordID)
        if (user && (await user.authAllowed(authToken))) {
          gmLog('websocket', 'Authorized client ' + discordID)
          return cb(true)
        }
      }
    }

    gmLog('websocket', 'Unauthorized connection')

    return cb(false, 401, 'Unauthorized')
  },
})

wss.on('connection', async function connectionWS(ws, req) {
  const { id, token } = req.headers

  if (id && token) {
    const existingClient = clients.server.find((client) => client.id === id)
    if (existingClient) {
      try {
        existingClient.ws.close()
      } catch {
        // ignore socket close errors
      }
      clients.server = clients.server.filter((client) => client.id !== id)
    }

    clients.server.push({ id: id.toString(), ws })
    gmLog('websocket', 'Server connected: ' + id)

    ws.on('close', () => {
      clients.server = clients.server.filter((client) => client.ws !== ws)
      gmLog('websocket', 'Server disconnected: ' + id)
    })

    ws.on('message', async (message: string) => {
      try {
        const wsInfo = JSON.parse(message)

        if (!wsInfo.action) {
          return
        }

        gmLog('websocket', 'Received from server ' + id + ' ' + JSON.stringify(wsInfo))

        switch (wsInfo.action) {
          case 'save_config': {
            const server = await getServerFromID(id.toString())
            if (!server) return
            await server.saveIGSettings(wsInfo.config)
            break
          }
          default:
            break
        }
      } catch (e) {
        gmLog('websocket', 'Error parsing message from server ' + id + ' ' + e)
      }
    })
  }

  if (req.url && req.url.includes('discordID') && req.url.includes('token')) {
    const args = new URLSearchParams(req.url.split('?')[1].split('/').join('&'))
    const discordID = args.get('discordID')
    const barerToken = args.get('token')

    if (discordID && barerToken) {
      const user = await getPanelUserFromDiscordID(discordID)
      if (!user) {
        gmLog('websocket', 'Client not found: ' + discordID)
        ws.close()
        return
      }

      const guildAdminListID: string[] = []
      const serverAdminListID: string[] = []

      const guildAdminList = await getUserGuildsWithPermsForPanel(user)
      for (const guildID of guildAdminList) {
        const server = await getServersFromDiscordGuildID(guildID.id)
        if (server) {
          for (const serverID of server) {
            serverAdminListID.push(serverID.id)
          }
        }
        guildAdminListID.push(guildID.id)
      }

      clients.client = clients.client.filter((client) => client.panelUser.discordID !== discordID)
      clients.client.push({ ws, panelUser: user, guildAdminListID, serverAdminListID })
      gmLog('websocket', 'Client connected: ' + discordID)

      ws.on('message', async (message: string) => {
        try {
          const wsInfo = JSON.parse(message)

          if (!wsInfo.action) {
            return
          }

          gmLog('websocket', 'Received from client ' + discordID + ' ' + JSON.stringify(wsInfo))

          switch (wsInfo.action) {
            case 'server_status': {
              const { serverID } = wsInfo.data

              const serverVersion = await redis.get(`server:${serverID}:version`)
              const serverLastRequest = await redis.get(`server:${serverID}:last_request`)

              wsSendToClient(
                discordID,
                {
                  action: 'server_status',
                  serverID,
                  version: serverVersion,
                  versionComparator: serverVersion ? versionComparator(lastGmodIntegrationTag, serverVersion) : 1,
                  lastRequest: serverLastRequest
                    ? new Date(serverLastRequest)
                    : new Date(new Date().getTime() - 1000 * 60 * 2),
                  isWebSocketConnected: !!clients.server.find((client) => client.id === serverID),
                },
                'server_status',
              )

              break
            }
            default:
              break
          }
        } catch (e) {
          gmLog('websocket', 'Error parsing message from client ' + discordID + ' ' + e)
        }
      })

      ws.on('close', () => {
        clients.client = clients.client.filter((client) => client.panelUser.discordID !== discordID)
        gmLog('websocket', 'Client disconnected: ' + discordID)
      })
    }
  }

  setInterval(() => {
    ws.ping()
  }, 1000)
})

function wsSendToServer(id: string, data: any) {
  const client = clients.server.find((client) => client.id === id)

  if (!client) {
    return false
  }

  const stringData = JSON.stringify(data)

  gmLog('websocket', 'Sending to server ' + id + ' ' + stringData)
  client.ws.send(stringData)

  return true
}

const wsSendToServerWorker = new Worker(
  wsSendToServerQueue.name,
  async (job) => {
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

function wsSendToClient(discordID: string, data: any, action: string) {
  const client = clients.client.find((client) => client.panelUser.discordID === discordID)

  if (!client) {
    return false
  }

  gmLog('websocket', 'Sending to client ' + discordID + ' ' + JSON.stringify(data))
  client.ws.send(JSON.stringify(data))

  return true
}

function wsSendToAllClientsOfServer(serverID: string, action: string, data: any) {
  const clientsToSend = clients.client.filter((client) => client.serverAdminListID.includes(serverID))

  for (const client of clientsToSend) {
    gmLog('websocket', 'Sending to client ' + client.panelUser.discordID + ' ' + JSON.stringify(data))
    client.ws.send(
      JSON.stringify({
        action,
        serverID,
        data,
      }),
    )
  }

  return true
}

const wsSendToAllClientsOfServerWorker = new Worker(
  wsSendToAllClientsOfServerQueue.name,
  async (job) => {
    wsSendToAllClientsOfServer(job.data.id, job.data.action, job.data.data)
  },
  {
    connection,
  },
)

gmLog('websocket', 'Listening on port ' + ConfigServer.ports.websocket)

async function gracefulShutdown() {
  gmLog('shutdown', 'Gracefully shutting down websocket app...')

  await wsSendToServerWorker.close()
  await wsSendToAllClientsOfServerWorker.close()
  await wsSendToServerSubscriber.unsubscribe(WS_SEND_TO_SERVER_BROADCAST_CHANNEL).catch(() => {})
  await wsSendToServerSubscriber.quit().catch(() => {})

  await new Promise<void>((resolve) => {
    wss.close(() => resolve())
  })

  await gracefulShutdownRedis()
  await gracefulShutdownPrisma()
  process.exit(0)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
