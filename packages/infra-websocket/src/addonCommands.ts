import { randomUUID } from 'node:crypto'
import redis from '@gmod/infra-redis'
import {
  AddonCommandResultSchema,
  AddonPanelRconCommandSchema,
  AddonRconCommandSchema,
} from '@gmod/schema/gmod/AddonTransportSchema.js'
import { enqueueWSSendToServerAndWait } from './queues.js'

const key = (id: string) => `ws:addon-command:${id}`
// Preserve the legacy Discord scope during rolling deployments, while binding panel ACKs
// to their own method before accepting the first terminal result.
const pendingScope = (serverID: string, method: string) =>
  method === 'wsAuthorizedRcon' ? serverID : JSON.stringify([serverID, method])
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
    pendingScope(serverID, result.data.method),
    JSON.stringify(result.data),
  )
}

export type AddonRconOutcome = 'executed' | 'permission_denied' | 'expired' | 'execution_failed' | 'delivery_uncertain'
type LegacyRconInput = { serverID: string; steamID: string; command: string }
type PanelRconInput = { serverID: string; actorDiscordID: string; command: string }
type RconInput = LegacyRconInput | PanelRconInput

async function waitForAddonRcon(input: RconInput, timeoutMs = 5000, detailed = false): Promise<AddonRconOutcome> {
  const duration = Math.max(1, Math.min(5000, timeoutMs))
  const requestID = randomUUID()
  const expiresAt = Date.now() + duration
  const packet =
    'actorDiscordID' in input
      ? AddonPanelRconCommandSchema.parse({
          method: 'wsPanelRcon',
          requestID,
          actorDiscordID: input.actorDiscordID,
          command: input.command,
          expiresAt,
        })
      : AddonRconCommandSchema.parse({
          method: 'wsAuthorizedRcon',
          requestID,
          steamID: input.steamID,
          command: input.command,
          expiresAt,
        })
  const pendingKey = key(requestID)
  const resultKey = `${pendingKey}:result`
  await redis.set(pendingKey, pendingScope(input.serverID, packet.method), 'PX', duration)
  try {
    if (detailed && Date.now() >= expiresAt) return 'delivery_uncertain'
    const delivery = enqueueWSSendToServerAndWait({ id: input.serverID, data: packet }, duration)
    if (detailed) {
      // The addon ACK is authoritative even when the queue's delivery acknowledgement fails or
      // times out before remote dispatch finishes. Wait until the original command deadline;
      // a failed queue acknowledgement does not prove that the command was never delivered.
      void delivery.catch(() => {})
    } else if (!(await delivery)) return 'delivery_uncertain'
    while (Date.now() < expiresAt) {
      const raw = await redis.get(resultKey)
      if (raw !== null) {
        const result = AddonCommandResultSchema.safeParse(JSON.parse(raw))
        return result.success && result.data.id === requestID && result.data.method === packet.method
          ? result.data.code
          : 'delivery_uncertain'
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, Math.max(1, expiresAt - Date.now()))))
    }
    return 'delivery_uncertain'
  } finally {
    if (detailed) {
      // Both keys already expire. Failed or stalled cleanup cannot erase a terminal addon ACK.
      void Promise.resolve()
        .then(() => redis.del(pendingKey, resultKey))
        .catch(() => {})
    } else await redis.del(pendingKey, resultKey)
  }
}

/** A socket write is insufficient: only a matching, successful addon execution acknowledges RCON. */
export async function enqueueAddonRconAndWait(input: LegacyRconInput, timeoutMs = 5000): Promise<boolean> {
  return (await waitForAddonRcon(input, timeoutMs)) === 'executed'
}

/** Once delivery is attempted, exceptions and missing acknowledgements leave execution uncertain. */
async function waitForDetailedRcon(input: RconInput, timeoutMs = 5000): Promise<AddonRconOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      waitForAddonRcon(input, timeoutMs, true),
      new Promise<AddonRconOutcome>((resolve) => {
        timer = setTimeout(() => resolve('delivery_uncertain'), Math.max(1, Math.min(5000, timeoutMs)))
      }),
    ])
  } catch {
    return 'delivery_uncertain'
  } finally {
    clearTimeout(timer)
  }
}

export function enqueueAddonRconAndWaitDetailed(input: LegacyRconInput, timeoutMs = 5000): Promise<AddonRconOutcome> {
  return waitForDetailedRcon(input, timeoutMs)
}

/** Panel permissions are authoritative; this command carries no Steam or in-game player identity. */
export function enqueuePanelRconAndWaitDetailed(input: PanelRconInput, timeoutMs = 5000): Promise<AddonRconOutcome> {
  return waitForDetailedRcon(input, timeoutMs)
}
