import redis from './index.js'

export interface AddonActivity {
  transport: 'http' | 'websocket'
  version?: unknown
  protocol?: 'legacy' | 'acknowledged'
  countRequest?: boolean
}

export interface AddonTelemetryItem {
  addonVersion: string | null
  lastSeenAt: string | null
  lastHttpAt: string | null
  lastWebsocketAt: string | null
  protocol: 'legacy' | 'acknowledged' | null
  httpRequestsPerMinute: number | null
  websocketRequestsPerMinute: number | null
  requestsPerMinute: number | null
}

export interface AddonTelemetrySnapshot {
  available: boolean
  observedAt: string | null
  items: AddonTelemetryItem[]
}

const METADATA_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_PENDING_COMMANDS = 32
const READ_BATCH_SIZE = 100
const COMMAND_TIMEOUT_MS = 250
let pendingCommands = 0

// Each server has 60 fixed slots per transport. An epoch in each slot makes stale
// counters expire logically, including when no requests arrive to rotate the ring.
const recordScript = `
local clock = redis.call('TIME')
local second = tonumber(clock[1])
local millis = second * 1000.0 + math.floor(tonumber(clock[2]) / 1000)
local key = KEYS[1]
redis.call('HSET', key, 'lastSeenAt', millis, ARGV[1] == 'http' and 'lastHttpAt' or 'lastWebsocketAt', millis)
if ARGV[2] ~= '' then redis.call('HSET', key, 'addonVersion', ARGV[2]) end
if ARGV[3] ~= '' then redis.call('HSET', key, 'protocol', ARGV[3]) end
if ARGV[4] == '1' then
  local field = ARGV[1] .. ':' .. (second % 60)
  local previous = redis.call('HGET', key, field) or ''
  local epoch, count = string.match(previous, '^(%d+):(%d+)$')
  count = tonumber(epoch) == second and tonumber(count) or 0
  redis.call('HSET', key, field, second .. ':' .. (count + 1))
end
redis.call('EXPIRE', key, ARGV[5])
return 1
`

const readScript = `
local clock = redis.call('TIME')
local second = tonumber(clock[1])
local output = {second * 1000.0 + math.floor(tonumber(clock[2]) / 1000)}
for index = 1, #KEYS, 3 do
  local fields = redis.call('HGETALL', KEYS[index])
  local metadata = {}
  local http, websocket = 0, 0
  for field = 1, #fields, 2 do
    local name, value = fields[field], fields[field + 1]
    metadata[name] = value
    local transport = string.match(name, '^(%a+):%d+$')
    if transport == 'http' or transport == 'websocket' then
      local epoch, count = string.match(value, '^(%d+):(%d+)$')
      epoch, count = tonumber(epoch), tonumber(count)
      if epoch and count and epoch > second - 60 and epoch <= second then
        if transport == 'http' then http = http + count else websocket = websocket + count end
      end
    end
  end
  table.insert(output, {
    metadata.addonVersion or redis.call('GET', KEYS[index + 1]) or '',
    metadata.lastSeenAt or redis.call('GET', KEYS[index + 2]) or '',
    metadata.lastHttpAt or '', metadata.lastWebsocketAt or '', metadata.protocol or '', http, websocket
  })
end
return output
`

const keyFor = (serverID: string) => `addon:telemetry:${serverID}`
const validServerID = (serverID: string) => /^[a-zA-Z0-9_-]{1,255}$/.test(serverID)
const validVersion = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 64 && /^v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value)
    ? value
    : null

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (value === '') return null
  const date = new Date(/^\d+$/.test(String(value)) ? Number(value) : value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function emptyItem(): AddonTelemetryItem {
  return {
    addonVersion: null,
    lastSeenAt: null,
    lastHttpAt: null,
    lastWebsocketAt: null,
    protocol: null,
    httpRequestsPerMinute: null,
    websocketRequestsPerMinute: null,
    requestsPerMinute: null,
  }
}

async function execute(script: string, keys: string[], args: Array<string | number> = []): Promise<unknown> {
  // Avoid ioredis's offline queue and bound outstanding work if a ready connection stalls.
  if (redis.status !== 'ready' || pendingCommands >= MAX_PENDING_COMMANDS) throw new Error('Telemetry unavailable')
  pendingCommands++
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation = Promise.resolve()
    .then(() => redis.eval(script, keys.length, ...keys, ...args))
    .finally(() => pendingCommands--)
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Telemetry timeout')), COMMAND_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Best-effort metrics must never reject an authenticated addon operation. */
export async function recordAddonActivity(serverID: string, activity: AddonActivity): Promise<void> {
  try {
    if (!validServerID(serverID) || !['http', 'websocket'].includes(activity.transport)) return
    await execute(
      recordScript,
      [keyFor(serverID)],
      [
        activity.transport,
        validVersion(activity.version) ?? '',
        activity.protocol === 'legacy' || activity.protocol === 'acknowledged' ? activity.protocol : '',
        activity.countRequest === false ? '0' : '1',
        METADATA_TTL_SECONDS,
      ],
    )
  } catch {
    // Metrics are intentionally unavailable during a Redis outage, without changing the request.
  }
}

/** Items retain the order of serverIDs; a successful missing bucket means zero recent requests. */
export async function readAddonTelemetry(serverIDs: string[]): Promise<AddonTelemetrySnapshot> {
  try {
    if (serverIDs.some((serverID) => !validServerID(serverID))) throw new Error('Invalid telemetry server')
    const items: AddonTelemetryItem[] = []
    let observedAt: string | null = null
    for (let start = 0; start < Math.max(1, serverIDs.length); start += READ_BATCH_SIZE) {
      const ids = serverIDs.slice(start, start + READ_BATCH_SIZE)
      const keys = ids.flatMap((id) => [keyFor(id), `server:${id}:version`, `server:${id}:last_request`])
      const result = await execute(readScript, keys)
      if (!Array.isArray(result) || result.length !== ids.length + 1) throw new Error('Invalid telemetry snapshot')
      observedAt = timestamp(result[0])
      if (!observedAt) throw new Error('Invalid telemetry clock')
      for (const row of result.slice(1)) {
        if (!Array.isArray(row) || row.length !== 7) throw new Error('Invalid telemetry item')
        const http = Number(row[5])
        const websocket = Number(row[6])
        if (![http, websocket, http + websocket].every((count) => Number.isSafeInteger(count) && count >= 0))
          throw new Error('Invalid telemetry counter')
        items.push({
          addonVersion: validVersion(row[0]),
          lastSeenAt: timestamp(row[1]),
          lastHttpAt: timestamp(row[2]),
          lastWebsocketAt: timestamp(row[3]),
          protocol: row[4] === 'legacy' || row[4] === 'acknowledged' ? row[4] : null,
          httpRequestsPerMinute: http,
          websocketRequestsPerMinute: websocket,
          requestsPerMinute: http + websocket,
        })
      }
    }
    return { available: true, observedAt, items }
  } catch {
    return { available: false, observedAt: null, items: serverIDs.map(emptyItem) }
  }
}
