import redis from './index.js'

export const CONSOLE_STREAM_CHANGED_CHANNEL = 'ws:console-stream:changed'
export const CONSOLE_VIEWER_TTL_MS = 30_000

const COMMAND_TIMEOUT_MS = 500
const MAX_PENDING_COMMANDS = 32
let pendingCommands = 0

const renewScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000.0 + math.floor(tonumber(time[2]) / 1000)
local requestedAt = tonumber(ARGV[5])
-- A stalled or re-sent command must not create a fresh lease after its caller gave up.
if now > requestedAt + 500 or requestedAt > now + 5000 then return 0 end
local expiresAt = math.min(tonumber(ARGV[2]), now + 30000)
if expiresAt <= now then return 0 end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZADD', KEYS[1], expiresAt, ARGV[1])
redis.call('PEXPIRE', KEYS[1], math.floor(expiresAt - now))
redis.call('PUBLISH', ARGV[3], ARGV[4])
return expiresAt
`
const removeScript = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('PUBLISH', ARGV[2], ARGV[3])
return 1
`
const removeLateScript = `
local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
if score and tonumber(score) == tonumber(ARGV[2]) then
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('PUBLISH', ARGV[3], ARGV[4])
end
return 1
`
const readScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000.0 + math.floor(tonumber(time[2]) / 1000)
local last = redis.call('ZREVRANGEBYSCORE', KEYS[1], '+inf', '(' .. now, 'WITHSCORES', 'LIMIT', 0, 1)
return { now, #last > 0 and tonumber(last[2]) or 0 }
`

function scopeKey(serverID: string, viewerID?: string) {
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(serverID) || (viewerID !== undefined && !/^[a-zA-Z0-9:_-]{1,128}$/.test(viewerID)))
    throw new Error('Invalid console viewer scope')
  return `ws:console-viewers:${serverID}`
}

async function execute(
  script: string,
  key: string,
  args: Array<string | number> = [],
  onLateCompletion?: (value: unknown) => Promise<unknown>,
): Promise<unknown> {
  // Never queue a later enable behind an offline Redis connection. The caller disables on failure.
  if (redis.status !== 'ready' || pendingCommands >= MAX_PENDING_COMMANDS)
    throw new Error('Console viewers unavailable')
  pendingCommands++
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation = Promise.resolve()
    .then(() => redis.eval(script, 1, key, ...args))
    .finally(() => pendingCommands--)
  if (onLateCompletion) void operation.then((value) => timedOut && onLateCompletion(value)).catch(() => {})
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          reject(new Error('Console viewers unavailable'))
        }, COMMAND_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** The viewer belongs to one authenticated dashboard socket, never the whole account. */
export async function renewConsoleViewer(serverID: string, viewerID: string): Promise<void> {
  const key = scopeKey(serverID, viewerID)
  const requestedAt = Date.now()
  const result = await execute(
    renewScript,
    key,
    [viewerID, requestedAt + CONSOLE_VIEWER_TTL_MS, CONSOLE_STREAM_CHANGED_CHANNEL, serverID, requestedAt],
    async (value) => {
      const expiresAt = Number(value)
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return
      // Compare the exact lease so a delayed reply cannot remove a newer successful renewal.
      await execute(removeLateScript, key, [viewerID, expiresAt, CONSOLE_STREAM_CHANGED_CHANNEL, serverID])
    },
  )
  if (!Number.isSafeInteger(Number(result)) || Number(result) <= 0) throw new Error('Console viewer renewal expired')
}

export async function removeConsoleViewer(serverID: string, viewerID: string): Promise<void> {
  await execute(removeScript, scopeKey(serverID, viewerID), [viewerID, CONSOLE_STREAM_CHANGED_CHANNEL, serverID])
}

/** Read without renewing viewers, so a crashed browser or gateway cannot keep streaming alive. */
export async function readConsoleViewers(serverID: string): Promise<{ enabled: boolean; expiresAt: number }> {
  const result = await execute(readScript, scopeKey(serverID))
  if (!Array.isArray(result) || result.length !== 2) throw new Error('Invalid console viewer snapshot')
  const [now, expiresAt] = result.map(Number)
  if (
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < 0 ||
    (expiresAt !== 0 && (expiresAt <= now || expiresAt > now + CONSOLE_VIEWER_TTL_MS))
  )
    throw new Error('Invalid console viewer snapshot')
  return { enabled: expiresAt > now, expiresAt }
}
