import { randomUUID } from 'node:crypto'
import redis from '@gmod/infra-redis'
import { AddonCommandResultSchema, AddonRconCommandSchema } from '@gmod/schema/gmod/AddonTransportSchema.js'
import { enqueueWSSendToServerAndWait } from './queues.js'

const key = (id: string) => `ws:addon-command:${id}`
const ACCEPT_RESULT = `
local pending = redis.call('GET', KEYS[1])
if not pending then return 0 end
if pending ~= ARGV[1] then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
return redis.call('SET', KEYS[2], ARGV[2], 'PX', ttl, 'NX') and 1 or 0
`

/** Called only after the gateway has authenticated the addon connection for this server. */
export async function acceptAddonCommandResult(serverID: string, packet: unknown): Promise<void> {
  const result = AddonCommandResultSchema.safeParse(packet)
  if (!result.success) return
  await redis.eval(
    ACCEPT_RESULT,
    2,
    key(result.data.id),
    `${key(result.data.id)}:result`,
    serverID,
    JSON.stringify(result.data),
  )
}

/** A socket write is insufficient: only a matching, successful addon execution acknowledges RCON. */
export async function enqueueAddonRconAndWait(
  input: { serverID: string; steamID: string; command: string },
  timeoutMs = 5000,
): Promise<boolean> {
  const duration = Math.max(1, Math.min(5000, timeoutMs))
  const requestID = randomUUID()
  const expiresAt = Date.now() + duration
  const packet = AddonRconCommandSchema.parse({
    method: 'wsAuthorizedRcon',
    requestID,
    steamID: input.steamID,
    command: input.command,
    expiresAt,
  })
  const pendingKey = key(requestID)
  const resultKey = `${pendingKey}:result`
  await redis.set(pendingKey, input.serverID, 'PX', duration)
  try {
    if (!(await enqueueWSSendToServerAndWait({ id: input.serverID, data: packet }, duration))) return false
    while (Date.now() < expiresAt) {
      const raw = await redis.get(resultKey)
      if (raw !== null) {
        const result = AddonCommandResultSchema.safeParse(JSON.parse(raw))
        return result.success && result.data.id === requestID && result.data.ok
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, Math.max(1, expiresAt - Date.now()))))
    }
    return false
  } finally {
    await redis.del(pendingKey, resultKey)
  }
}
