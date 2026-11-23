import { z } from 'zod'
import type { Server } from '@gmod/domain-server/Server.js'
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import redis from '@gmod/infra-redis'
import { AddonRequestSchema, ADDON_MAX_LOG_ENTRIES, type AddonRequest } from '@gmod/schema/gmod/AddonTransportSchema.js'
import { GmodCaptureDataSchema } from '@gmod/schema/gmod/GmodCaptureDataSchema.js'
import { ServerDashboardSettingsSchema } from '@gmod/schema/server/DashboardSettingsSchema.js'
import { AccessDeniedError } from '@gmod/domain-access/index.js'
import { logServer } from '../../utils/logger.js'
import { lastGmodIntegrationTag } from '../../utils/tools.js'
import {
  processCHATMDepositMoney,
  processCHATMReceiveMoney,
  processCHATMSendMoney,
  processCHATMTakeMoney,
  processCHATMWithdrawMoney,
  processDarkRPDropMoney,
  processDarkRPPickedUpCheque,
  processDarkRPPickedUpMoney,
  processPostStatus,
  processServerImportWarns,
} from '../v3/serversControllerModels.js'
import {
  processPlayerChangeGroup,
  processPlayerChangeName,
  processPlayerChangeTeam,
  processPlayerConnect,
  processPlayerDisconnect,
  processPlayerSay,
  processPlayerWarn,
} from '../v3/serversPlayersControllerModels.js'
import { reportBugPayload, uploadScreenshotPayload } from '../v3/clientsModels.js'
import { saveServerDashboardSettings } from '../v6/dashboardSettings.js'
import { reportGmodErrorPayloadSafe } from './gmodErrorsModels.js'

export {
  AddonRequestSchema,
  ADDON_MAX_MESSAGE_BYTES,
  ADDON_MAX_LOG_ENTRIES,
  ADDON_PROTOCOL_VERSION,
  type AddonRequest,
} from '@gmod/schema/gmod/AddonTransportSchema.js'

export interface AddonResult {
  status: number
  body: unknown
}

const ok = (body: unknown = { success: true }): AddonResult => ({ status: 200, body })
const invalid = (): AddonResult => ({ status: 400, body: { error: 'invalid_payload' } })
const forbidden = (): AddonResult => ({ status: 403, body: { error: 'forbidden' } })
const notFound = (): AddonResult => ({ status: 404, body: { error: 'unknown_addon_endpoint' } })
const steamID = z.string().regex(/^\d{17}$/)
const text = (max = 1024) => z.string().max(max)
const record = z.record(z.unknown())
const emptyLuaTable = (value: unknown): boolean =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
const luaArray = <T extends z.ZodTypeAny>(item: T, maximum: number) =>
  z.preprocess((value) => (emptyLuaTable(value) ? [] : value), z.array(item).max(maximum))
const player = z
  .object({
    steamID64: z.union([steamID, z.literal('0')]),
    steamID: text(32),
    name: text(256),
    userGroup: text(128),
    kills: z.number().finite(),
    deaths: z.number().finite(),
    connectTime: z.number().finite(),
    customValues: record,
    team: z.object({ id: z.number().finite(), name: text(256) }).passthrough(),
    position: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }),
    angle: z.object({ p: z.number().finite(), y: z.number().finite(), r: z.number().finite() }),
  })
  .passthrough()
const captureData = GmodCaptureDataSchema.extend({
  w: z.number().int().min(1).max(16_384),
  h: z.number().int().min(1).max(16_384),
  x: z.number().int().min(0).max(16_384),
  y: z.number().int().min(0).max(16_384),
  quality: z.number().int().min(0).max(100),
})
const screenshotData = z.object({
  screenshot: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  captureData,
  size: text(64),
})
const screenshot = screenshotData.extend({ player, title: text(256).optional() }).passthrough()
const bug = z
  .object({
    player,
    description: z.string().min(1).max(16_384),
    importance: z.enum(['critical', 'high', 'medium', 'low', 'trivial']),
    steps: text(16_384),
    expected: text(16_384),
    actual: text(16_384),
    // Attachment validation must not discard the report itself; the model returns its separate outcome.
    screenshot: z.unknown().optional(),
  })
  .passthrough()
const errorBody = z
  .object({
    error: text(65_536),
    stack: z.union([text(65_536), luaArray(record, 256)]),
    realm: z.enum(['server', 'client']),
    uptime: z.number().finite().nonnegative(),
    count: z.number().int().positive(),
    name: text(256).optional(),
    id: z.union([text(64), z.number().finite()]).optional(),
  })
  .passthrough()
const statusBody = z
  .object({
    players: z.number().int().min(0).max(4096),
    playersList: luaArray(player, 4096).optional(),
    maxPlayers: z.number().int().min(0).max(4096),
    map: text(256),
    hostname: text(512),
    gameMode: text(128),
    port: z.number().int().min(0).max(65_535),
    ip: text(128),
    uptime: z.number().finite().nonnegative(),
  })
  .passthrough()

// Reuse the HTTP client's existing per-player windows across transports and replicas.
const CLIENT_RATE_SCRIPT = `
if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
local second = redis.call('INCR', KEYS[1])
if second == 1 then redis.call('EXPIRE', KEYS[1], 1) end
local minute = redis.call('INCR', KEYS[2])
if minute == 1 then redis.call('EXPIRE', KEYS[2], 60) end
if second > 4 then redis.call('SET', KEYS[3], 1, 'EX', 60); return 0 end
if minute > 11 then redis.call('SET', KEYS[3], 1, 'EX', 86400); return 0 end
return 1`

async function clientAllowed(id: string): Promise<boolean> {
  return (
    Number(
      await redis.eval(
        CLIENT_RATE_SCRIPT,
        3,
        `client_request_count_1s_${id}`,
        `client_request_count_60s_${id}`,
        `client_request_block_${id}`,
      ),
    ) === 1
  )
}

const moneyActions = {
  'dark-rp/drop-money': processDarkRPDropMoney,
  'dark-rp/picked-up-money': processDarkRPPickedUpMoney,
  'dark-rp/picked-up-cheque': processDarkRPPickedUpCheque,
  'ch-atm/take-money': processCHATMTakeMoney,
  'ch-atm/receive-money': processCHATMReceiveMoney,
  'ch-atm/send-money': processCHATMSendMoney,
  'ch-atm/withdraw-money': processCHATMWithdrawMoney,
  'ch-atm/deposit-money': processCHATMDepositMoney,
} as const
const eventLogs: Record<string, string> = {
  ready: 'player_ready',
  spawn: 'player_spawn',
  death: 'player_death',
  'initial-spawn': 'player_initial_spawn',
  hurt: 'player_hurt',
  give: 'player_give',
  say: 'player_say',
  name: 'player_change_name',
  group: 'player_change_group',
  team: 'player_change_team',
  connect: 'player_connect',
  disconnect: 'player_disconnect',
  warns: 'player_warned',
  ban: 'player_ban',
  bans: 'player_ban',
  kick: 'player_kick',
}
const batchEvents = new Set([
  'ready',
  'spawn',
  'death',
  'initial-spawn',
  'hurt',
  'give',
  'spawn/prop',
  'spawn/sent',
  'spawn/npc',
  'spawn/vehicle',
  'spawn/effect',
  'spawn/ragdoll',
  'spawn/swep',
  ...Object.keys(moneyActions),
])

function scopedPath(server: Server, endpoint: string): string | undefined {
  const match = /^\/servers\/([^/]+)(.*)$/.exec(endpoint)
  return match?.[1] === String(server.getID()) ? match[2] : undefined
}

function validEventBody(event: string, body: unknown, id: string): boolean {
  if (!record.safeParse(body).success) return false
  const data = body as Record<string, unknown>
  const identity =
    event === 'hurt' ? data.victim : event === 'dark-rp/picked-up-cheque' ? data.playerChequeTarget : data.player
  if (
    identity !== undefined &&
    (!player.safeParse(identity).success || (identity as { steamID64: string }).steamID64 !== id)
  )
    return false
  if (event === 'connect')
    return z.object({ name: text(256), address: text(128), networkid: text(64) }).safeParse(body).success
  if (['ban', 'bans', 'kick'].includes(event))
    return z.object({ reason: text(4096).optional(), networkid: text(64).optional() }).safeParse(body).success
  if (event === 'group') return z.object({ oldGroup: text(128), newGroup: text(128) }).safeParse(body).success
  if (event === 'warns')
    return (
      (!!data.admin || !!data.adminSteamID64) &&
      z
        .object({
          reason: text(4096),
          date: z.union([z.string().regex(/^\d+(?:\.\d+)?$/), z.number().finite()]),
          admin: player.optional(),
          adminSteamID64: steamID.optional(),
        })
        .safeParse(body).success
    )
  if (!player.safeParse(identity).success) return false
  if (event === 'say') return z.object({ text: text(4096), teamOnly: z.boolean() }).safeParse(body).success
  if (event === 'name') return z.object({ oldName: text(256), newName: text(256) }).safeParse(body).success
  if (event === 'team') return z.object({ oldTeam: record, newTeam: record }).safeParse(body).success
  if (Object.hasOwn(moneyActions, event)) {
    if (!z.number().finite().safeParse(data.amount).success) return false
    if (event === 'ch-atm/send-money' && !player.safeParse(data.receiver).success) return false
    if (event.startsWith('dark-rp/') && !record.safeParse(data.entity).success) return false
    if (event === 'dark-rp/picked-up-cheque' && !player.safeParse(data.playerChequeWriter).success) return false
    if (['ch-atm/take-money', 'ch-atm/receive-money'].includes(event) && !text(4096).safeParse(data.reason).success)
      return false
  }
  return Object.hasOwn(eventLogs, event) || batchEvents.has(event)
}

async function playerEvent(
  server: Server,
  id: string,
  event: string,
  body: Record<string, unknown>,
): Promise<AddonResult> {
  if (
    !Object.hasOwn(eventLogs, event) &&
    !Object.hasOwn(moneyActions, event) &&
    !/^spawn\/(prop|sent|npc|vehicle|effect|ragdoll|swep)$/.test(event)
  )
    return notFound()
  if (!validEventBody(event, body, id)) return invalid()
  if (Object.hasOwn(moneyActions, event)) return moneyActions[event as keyof typeof moneyActions](server, body)
  const spawned = /^spawn\/(prop|sent|npc|vehicle|effect|ragdoll|swep)$/.exec(event)
  const logID = spawned ? 'player_spawn_object' : eventLogs[event]
  if (!logID) return notFound()
  const logBody = { ...body, steamID64: id, ...(spawned ? { object: spawned[1] } : {}) }
  await logServer(server, logID, logBody)
  switch (event) {
    case 'say':
      return processPlayerSay(server, id, body)
    case 'name':
      return processPlayerChangeName(server, body)
    case 'group':
      return processPlayerChangeGroup(server, id, body)
    case 'team':
      return processPlayerChangeTeam(server, id, body)
    case 'connect':
      return processPlayerConnect(server, id, body)
    case 'disconnect':
      return processPlayerDisconnect(server, body)
    case 'warns': {
      if (!body.player || !body.admin) {
        return processServerImportWarns(server, [
          {
            playerSteamID64: id,
            adminSteamID64: body.adminSteamID64 || (body.admin as { steamID64?: string } | undefined)?.steamID64,
            reason: body.reason,
            date: body.date,
          },
        ])
      }
      return processPlayerWarn(server, id, body)
    }
    default:
      return ok()
  }
}

/** Server identity always comes from the authenticated socket, never from request data. */
export async function handleAddonRequest(server: Server, rawRequest: AddonRequest): Promise<AddonResult> {
  const parsed = AddonRequestSchema.safeParse(rawRequest)
  if (!parsed.success) return invalid()
  const request = parsed.data
  const userLookup = /^\/users\?steamID64=(\d{17})$/.exec(request.endpoint)
  if (userLookup) {
    if (request.method !== 'GET') return notFound()
    const user = await getUserFromSteamID64(userLookup[1])
    return user
      ? ok({ steamID64: user.steamID64, discordID: user.discordID })
      : { status: 404, body: { error: 'User not found' } }
  }
  const client = /^\/clients\/(\d{17})\/servers\/([^/]+)\/(screenshots|bugs|errors)$/.exec(request.endpoint)
  if (client) {
    if (client[2] !== String(server.getID())) return forbidden()
    if (request.method !== 'POST') return notFound()
    const id = client[1]
    const schema = client[3] === 'screenshots' ? screenshot : client[3] === 'bugs' ? bug : errorBody
    const parsedBody = schema.safeParse(request.body)
    if (!parsedBody.success) return invalid()
    const body = parsedBody.data as Record<string, unknown>
    if (client[3] !== 'errors' && (body.player as { steamID64: string }).steamID64 !== id) return forbidden()
    if (
      client[3] === 'errors' &&
      (body.realm !== 'client' || (body.identifier !== undefined && body.identifier !== id))
    )
      return forbidden()
    if (!(await clientAllowed(id))) return { status: 429, body: { error: 'too_many_requests' } }
    if (client[3] === 'errors')
      return reportGmodErrorPayloadSafe(
        { ...body, ...(body.id !== undefined ? { id: String(body.id) } : {}) },
        { serverID: String(server.getID()), steamID64: id },
      )
    const result =
      client[3] === 'screenshots' ? await uploadScreenshotPayload(server, body) : await reportBugPayload(server, body)
    if (client[3] === 'bugs' && 'skip' in result)
      return { status: 403, body: { error: 'personal_data_collection_disabled' } }
    return { status: 'error' in result ? 400 : 200, body: result }
  }
  const path = scopedPath(server, request.endpoint)
  if (path === undefined) return request.endpoint.startsWith('/servers/') ? forbidden() : notFound()
  if (request.method === 'GET') {
    if (path === '')
      return ok({ id: server.getID(), name: server.name, guild: server.guild, latestVersion: lastGmodIntegrationTag })
    if (path === '/config') return ok(await server.getAllIGSettings())
    const target = /^\/players\/(\d{17}|0)\/access$/.exec(path)
    if (target) {
      try {
        return ok(await server.getPlayerAccess(target[1]))
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'provider_unavailable')
          return { status: 503, body: { error: 'player_access_unavailable' } }
        throw error
      }
    }
    const playerStats = /^\/players\/(\d{17}|0)$/.exec(path)
    if (playerStats) return ok((await server.getPlayerStats(playerStats[1])) || {})
    return notFound()
  }
  if (path === '/stop') {
    await logServer(server, 'server_stop')
    return ok()
  }
  if (path === '/logs') {
    const incoming = emptyLuaTable(request.body) ? [] : request.body
    if (!Array.isArray(incoming) || incoming.length > ADDON_MAX_LOG_ENTRIES) return invalid()
    const batch = incoming as { endpoint: string; data: Record<string, unknown> }[]
    const entries = batch.map((entry) => {
      if (!record.safeParse(entry).success || typeof entry.endpoint !== 'string') return undefined
      const local = scopedPath(server, entry.endpoint)
      const target = local === undefined ? null : /^\/players\/(\d{17}|0)\/(.+)$/.exec(local)
      return target && batchEvents.has(target[2]) && validEventBody(target[2], entry.data, target[1])
        ? { id: target[1], event: target[2], body: entry.data }
        : undefined
    })
    // Validate the entire batch before recording anything, preventing partial writes on bad input.
    if (entries.some((entry) => !entry)) return invalid()
    for (const entry of entries) {
      const result = await playerEvent(server, entry!.id, entry!.event, entry!.body)
      if (result.status !== 200) return result
    }
    return ok()
  }
  if (!record.safeParse(request.body).success) return invalid()
  const body = request.body as Record<string, unknown>
  if (path === '/config') {
    const settings = Object.fromEntries(Object.entries(body).map(([key, value]) => [`ig_${key}`, value]))
    const accepted = ServerDashboardSettingsSchema.safeParse(settings)
    if (!accepted.success) return invalid()
    try {
      return ok(await saveServerDashboardSettings(server, accepted.data))
    } catch (error) {
      if (error instanceof AccessDeniedError)
        return { status: error.status, body: { error: error.code, capability: error.capability } }
      throw error
    }
  }
  if (path === '/status' || path === '/start') {
    const parsedStatus = statusBody.safeParse(body)
    if (!parsedStatus.success) return invalid()
    const result = await processPostStatus(server, parsedStatus.data)
    if (result.status === 200 && path === '/start') await logServer(server, 'server_start')
    return result
  }
  if (path === '/errors') {
    const parsedError = errorBody.safeParse(body)
    if (!parsedError.success || body.realm !== 'server') return invalid()
    return reportGmodErrorPayloadSafe(
      { ...parsedError.data, ...(body.id !== undefined ? { id: String(body.id) } : {}) },
      { serverID: String(server.getID()), steamID64: '' },
    )
  }
  if (path === '/warns') {
    const warns = luaArray(
      z.object({
        playerSteamID64: steamID,
        adminSteamID64: z.union([steamID, z.literal('')]),
        reason: text(4096).optional(),
        date: z.union([text(64), z.number().finite()]),
      }),
      10_000,
    )
    const parsedWarns = warns.safeParse(body.warns)
    if (!parsedWarns.success) return invalid()
    return processServerImportWarns(server, parsedWarns.data)
  }
  const target = /^\/players\/(\d{17}|0)\/(.+)$/.exec(path)
  return target ? playerEvent(server, target[1], target[2], body) : notFound()
}
