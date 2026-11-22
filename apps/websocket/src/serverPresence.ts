import redis from '@gmod/infra-redis'

export const SERVER_PRESENCE_TTL_MS = 90_000

const presenceKey = (serverID: string) => `ws:server-presence:${serverID}`

// Redis supplies the clock so replicas with different wall clocks agree on lease expiry.
const refreshScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`

const readScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
return redis.call('ZCARD', KEYS[1])
`

/** One lease per socket; removing an older connection cannot remove its replacement. */
export function createServerPresence(serverID: string, connectionID: string) {
  const key = presenceKey(serverID)
  let closed = false
  let pending = Promise.resolve()
  let closing: Promise<void> | undefined

  function enqueue(operation: () => Promise<void>) {
    const result = pending.then(operation)
    // A failed renewal must not prevent a subsequent close from removing the lease.
    pending = result.catch(() => {})
    return result
  }

  return {
    refresh(): Promise<void> {
      if (closed) return Promise.resolve()
      return enqueue(async () => {
        if (closed) return
        await redis.eval(refreshScript, 1, key, connectionID, SERVER_PRESENCE_TTL_MS)
      })
    },
    close(): Promise<void> {
      if (closing) return closing
      closed = true
      // Wait for an issued renewal before removing the member; it cannot resurrect this socket.
      closing = enqueue(async () => {
        await redis.zrem(key, connectionID)
      })
      return closing
    },
  }
}

export async function isServerPresent(serverID: string): Promise<boolean> {
  return Number(await redis.eval(readScript, 1, presenceKey(serverID))) > 0
}
