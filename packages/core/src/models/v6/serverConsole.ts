import { createHash, randomUUID } from 'node:crypto'
import redis from '@gmod/infra-redis'
import { assertCapability, resolveGuildAccess } from '@gmod/domain-access/index.js'
import type { AuthSession } from '@gmod/domain-auth/authSessions.js'
import { enqueuePanelRconAndWaitDetailed } from '@gmod/infra-websocket/addonCommands.js'
import {
  ConsoleRconRequestSchema,
  ConsoleRconResponseSchema,
  type ConsoleRconResponse,
} from '@gmod/schema/gmod/ConsoleStreamSchema.js'

const RESULT_TTL_MS = 10 * 60 * 1000
const ACTIVE_TTL_MS = 15_000
const STORE_TIMEOUT_MS = 1000
const MAX_PENDING_STORE_COMMANDS = 16
let pendingStoreCommands = 0

// Reserve and rate-limit atomically across API replicas. Only digests and public outcomes
// enter this ledger; command text remains solely in the existing expiring delivery packet.
const reserveScript = `
local existing = redis.call('GET', KEYS[1])
if existing then
  if string.sub(existing, 1, 64) ~= ARGV[1] then return {'conflict', ''} end
  if string.sub(existing, 65, 72) == ':result:' then return {'completed', string.sub(existing, 73)} end
  return {'pending', ''}
end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000.0 + math.floor(tonumber(time[2]) / 1000)
if now > tonumber(ARGV[5]) then return {'unavailable', ''} end
if redis.call('ZCOUNT', KEYS[5], '(' .. now, '+inf') == 0 then return {'offline', ''} end
if redis.call('EXISTS', KEYS[2]) == 1 then return {'busy', ''} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 12 or tonumber(redis.call('GET', KEYS[4]) or '0') >= 60 then
  return {'rate_limited', ''}
end
redis.call('SET', KEYS[1], ARGV[1] .. ':pending:' .. ARGV[2], 'PX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[4])
if redis.call('INCR', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], 60) end
if redis.call('INCR', KEYS[4]) == 1 then redis.call('EXPIRE', KEYS[4], 60) end
return {'reserved', ''}
`

const completeScript = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 and redis.call('GET', KEYS[1]) == ARGV[1] .. ':pending:' .. ARGV[3] then
  redis.call('SET', KEYS[1], ARGV[1] .. ':result:' .. ARGV[2], 'PX', ttl)
end
if redis.call('GET', KEYS[2]) == ARGV[3] then redis.call('DEL', KEYS[2]) end
return 1
`

export class ServerConsoleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
    this.name = 'ServerConsoleError'
  }
}

const unavailable = () => new ServerConsoleError(503, 'console_unavailable')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

async function store(script: string, keys: string[], args: Array<string | number>): Promise<unknown> {
  if (redis.status !== 'ready' || pendingStoreCommands >= MAX_PENDING_STORE_COMMANDS) throw unavailable()
  pendingStoreCommands++
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation = Promise.resolve()
    .then(() => redis.eval(script, keys.length, ...keys, ...args))
    .finally(() => pendingStoreCommands--)
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(unavailable()), STORE_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** The caller supplies the server and session resolved by the authenticated dashboard middleware. */
export async function executeServerConsoleCommand(
  server: { id: string; guild: string },
  session: AuthSession,
  raw: unknown,
): Promise<ConsoleRconResponse> {
  const parsed = ConsoleRconRequestSchema.safeParse(raw)
  if (!parsed.success || !/^[a-zA-Z0-9_-]{1,255}$/.test(server.id)) throw new ServerConsoleError(400, 'invalid_request')
  await resolveGuildAccess(server.guild).then((access) => assertCapability(access, 'console.rcon'))
  const actorDiscordID = session.actorDiscordID ?? session.discordID

  const requestID = parsed.data.requestID.toLowerCase()
  const command = parsed.data.command
  const fingerprint = digest(JSON.stringify([actorDiscordID, session.discordID, server.id, digest(command)]))
  const reservationToken = randomUUID()
  const requestKey = `console:rcon:request:${requestID}`
  const activeKey = `console:rcon:active:${server.id}`
  const actorRateKey = `console:rcon:rate:actor:${digest(JSON.stringify([actorDiscordID, server.id]))}`
  let reservation: unknown
  try {
    reservation = await store(
      reserveScript,
      [requestKey, activeKey, actorRateKey, `console:rcon:rate:server:${server.id}`, `ws:server-presence:${server.id}`],
      [fingerprint, reservationToken, RESULT_TTL_MS, ACTIVE_TTL_MS, Date.now() + STORE_TIMEOUT_MS],
    )
  } catch {
    throw unavailable()
  }
  if (!Array.isArray(reservation) || reservation.length !== 2) throw unavailable()
  const [state, value] = reservation
  if (state === 'completed') {
    try {
      const recorded = ConsoleRconResponseSchema.parse(JSON.parse(String(value)))
      if (recorded.serverID !== server.id || recorded.requestID !== requestID) throw unavailable()
      return recorded
    } catch {
      throw unavailable()
    }
  }
  if (state !== 'reserved') {
    const errors: Record<string, [number, string]> = {
      conflict: [409, 'request_conflict'],
      pending: [409, 'request_pending'],
      busy: [409, 'command_in_progress'],
      offline: [409, 'server_offline'],
      rate_limited: [429, 'rate_limited'],
    }
    const error = errors[String(state)]
    throw error ? new ServerConsoleError(...error) : unavailable()
  }

  // A reserved ID is never released for retry after delivery may have begun. A crash
  // leaves a pending tombstone until its ten-minute TTL rather than replaying a command.
  const code = await enqueuePanelRconAndWaitDetailed({ serverID: server.id, actorDiscordID, command }).catch(
    () => 'delivery_uncertain' as const,
  )
  const outcome = ConsoleRconResponseSchema.safeParse({
    serverID: server.id,
    requestID,
    status: code === 'executed' ? 'executed' : code === 'delivery_uncertain' ? 'unknown' : 'rejected',
    code,
  })
  const response: ConsoleRconResponse = outcome.success
    ? outcome.data
    : { serverID: server.id, requestID, status: 'unknown', code: 'delivery_uncertain' }
  try {
    await store(completeScript, [requestKey, activeKey], [fingerprint, JSON.stringify(response), reservationToken])
  } catch {
    // The original pending tombstone still blocks replay if outcome persistence is unavailable.
  }
  return response
}
