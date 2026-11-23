import { Queue } from 'bullmq'
import { connection } from './index.js'
import {
  DiscordPublicInviteUrlSchema,
  DiscordGuildPublicInviteJobSchema,
  DiscordGuildPublicInviteReplySchema,
  UpdateGuildUserPseudoJobSchema,
  UpdatePlayerUserGroupJobSchema,
  UpdateDiscordTeamRoleJobSchema,
  MainClientHasGuildJobSchema,
  MainClientHasGuildReplySchema,
  MainClientUploadScreenshotJobSchema,
  MainClientUploadScreenshotReplySchema,
  MainClientFetchUserJobSchema,
  MainClientFetchUserReplySchema,
  MainClientSyncPremiumRolesJobSchema,
  MainClientSyncPremiumRolesReplySchema,
  MainClientSetPresenceJobSchema,
  MainClientSetPresenceReplySchema,
  DiscordGuildSnapshotJobSchema,
  DiscordGuildSnapshotReplySchema,
  DiscordGuildMemberRoleJobSchema,
  DiscordGuildMemberRoleReplySchema,
  type DiscordGuildMemberRoleResult,
  DiscordGuildVerifyUserJobSchema,
  DiscordGuildVerifyUserReplySchema,
  DiscordGuildRunVerificationCheckJobSchema,
  DiscordGuildRunVerificationCheckReplySchema,
  DiscordCreateVerificationMessageJobSchema,
  DiscordCreateVerificationMessageReplySchema,
  DiscordDeleteVerificationMessageJobSchema,
  DiscordDeleteVerificationMessageReplySchema,
  DiscordGuildBotClientInfoJobSchema,
  DiscordGuildBotClientInfoReplySchema,
  DiscordGuildReloadBotInstanceJobSchema,
  DiscordGuildReloadBotInstanceReplySchema,
  DiscordGuildUpdateBotProfileJobSchema,
  DiscordGuildUpdateBotProfileReplySchema,
  DiscordGuildSyncBanJobSchema,
  DiscordGuildSyncBanReplySchema,
  DiscordGuildAdminsJobSchema,
  DiscordGuildAdminsReplySchema,
  DiscordGuildBansJobSchema,
  DiscordGuildBansReplySchema,
  DiscordGuildSendLogMessageJobSchema,
  DiscordGuildSendLogMessageReplySchema,
  DiscordServerStatusCreateJobSchema,
  DiscordServerStatusCreateReplySchema,
  DiscordServerStatusPreviewJobSchema,
  DiscordServerStatusPreviewReplySchema,
  DiscordServerStatusDeleteJobSchema,
  DiscordServerStatusDeleteReplySchema,
  DiscordServerStatusRefreshJobSchema,
  DiscordServerStatusRefreshReplySchema,
  DiscordServerLogsChannelCreateJobSchema,
  DiscordServerLogsChannelCreateReplySchema,
  DiscordServerLogsChannelDeleteJobSchema,
  DiscordServerLogsChannelDeleteReplySchema,
  DiscordServerScreenshotChannelCreateJobSchema,
  DiscordServerScreenshotChannelCreateReplySchema,
  DiscordServerScreenshotChannelDeleteJobSchema,
  DiscordServerScreenshotChannelDeleteReplySchema,
  DiscordServerVoteChannelCreateJobSchema,
  DiscordServerVoteChannelCreateReplySchema,
  DiscordServerVoteChannelDeleteJobSchema,
  DiscordServerVoteChannelDeleteReplySchema,
  DiscordServerSyncChatCreateJobSchema,
  DiscordServerSyncChatCreateReplySchema,
  DiscordServerSyncChatDeleteJobSchema,
  DiscordServerSyncChatDeleteReplySchema,
  DiscordGuildRemoveSyncRolesJobSchema,
  DiscordGuildRemoveSyncRolesReplySchema,
  type UpdateGuildUserPseudoJob,
  type UpdatePlayerUserGroupJob,
  type UpdateDiscordTeamRoleJob,
  type MainClientUploadScreenshotJob,
  type DiscordGuildSummary,
  type DiscordServerStatusRecord,
  type DiscordServerLogsChannelRecord,
  type DiscordServerScreenshotChannelRecord,
  type DiscordServerVoteChannelRecord,
  type DiscordServerSyncChatRecord,
} from './schemas.js'
import { randomUUID } from 'node:crypto'
import redis from '@gmod/infra-redis'
import { JobPriority } from './priorities.js'
import type { StatusMessagePreviewInput, StatusMessagePreview } from '@gmod/schema/server/StatusMessagePreviewSchema.js'

// Queues
const discordUpdatePseudoQueue = new Queue('discord-updatePseudo', { connection })
const discordUpdateGroupQueue = new Queue('discord-updateGroup', { connection })
const discordUpdateTeamRoleQueue = new Queue('discord-updateTeamRole', { connection })
const discordMainClientOpsQueue = new Queue('discord-mainClientOps', { connection })
const discordGuildOpsQueue = new Queue('discord-guildOps', { connection })
// Status refreshes are slow (several Discord calls each) and high-volume (every server
// status post). They get their own queue so they can never occupy the guildOps worker
// slots that the API is waiting on.
const discordStatusRefreshQueue = new Queue('discord-statusRefresh', { connection })

/** Minimum delay between two automatic status refreshes of the same server. */
const STATUS_REFRESH_THROTTLE_MS = 60_000

const GUILD_SNAPSHOT_CACHE_TTL_MS = 10_000
const GUILD_SNAPSHOT_NULL_CACHE_TTL_MS = 3_000
const guildSnapshotCache = new Map<
  string,
  {
    value: DiscordGuildSummary | null
    expiresAt: number
  }
>()
const guildSnapshotInFlight = new Map<string, Promise<DiscordGuildSummary | null>>()
const guildPublicInviteInFlight = new Map<string, Promise<string | null>>()
const GUILD_SNAPSHOT_CACHE_MAX_ENTRIES = 500

export class BullMQReplyTimeoutError extends Error {
  public readonly correlationId: string
  public readonly timeoutMs: number

  constructor(correlationId: string, timeoutMs: number) {
    super(`Timeout waiting for BullMQ reply (${correlationId})`)
    this.name = 'BullMQReplyTimeoutError'
    this.correlationId = correlationId
    this.timeoutMs = timeoutMs
  }
}

export function isBullMQReplyTimeoutError(error: unknown): error is BullMQReplyTimeoutError {
  return (
    error instanceof BullMQReplyTimeoutError || (error instanceof Error && error.name === 'BullMQReplyTimeoutError')
  )
}

function getReplyKey(correlationId: string): string {
  return `bullmq:reply:${correlationId}`
}

function getCachedGuildSnapshot(guildID: string): DiscordGuildSummary | null | undefined {
  const cached = guildSnapshotCache.get(guildID)
  if (!cached) {
    return undefined
  }

  if (cached.expiresAt <= Date.now()) {
    guildSnapshotCache.delete(guildID)
    return undefined
  }

  return cached.value
}

function pruneGuildSnapshotCache(now = Date.now()): void {
  for (const [cachedGuildID, cached] of guildSnapshotCache.entries()) {
    if (cached.expiresAt <= now) {
      guildSnapshotCache.delete(cachedGuildID)
    }
  }
}

function setCachedGuildSnapshot(guildID: string, value: DiscordGuildSummary | null): void {
  if (guildSnapshotCache.size >= GUILD_SNAPSHOT_CACHE_MAX_ENTRIES) {
    pruneGuildSnapshotCache()
  }

  guildSnapshotCache.set(guildID, {
    value,
    expiresAt: Date.now() + (value ? GUILD_SNAPSHOT_CACHE_TTL_MS : GUILD_SNAPSHOT_NULL_CACHE_TTL_MS),
  })
}

async function waitForReply<T>(correlationId: string, parser: (value: unknown) => T, timeoutMs = 5000): Promise<T> {
  const key = getReplyKey(correlationId)
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const raw = await redis.get(key)
    if (raw) {
      await redis.del(key)
      return parser(JSON.parse(raw))
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new BullMQReplyTimeoutError(correlationId, timeoutMs)
}

/**
 * Enqueue: Synchroniser pseudo Discord
 */
export async function enqueueUpdateGuildUserPseudo(
  data: Omit<UpdateGuildUserPseudoJob, 'correlationId' | 'timestamp'>,
): Promise<void> {
  try {
    const payload = UpdateGuildUserPseudoJobSchema.parse({
      ...data,
      correlationId: randomUUID(),
      timestamp: new Date(),
    })

    await discordUpdatePseudoQueue.add('updatePseudo', payload, {
      priority: JobPriority.NORMAL,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    })
  } catch (error) {
    console.error(`[bullmq] Failed to queue updatePseudo: ${(error as Error).message}`)
    throw error
  }
}

/**
 * Enqueue: Synchroniser groupe Discord
 */
export async function enqueueUpdatePlayerUserGroup(
  data: Omit<UpdatePlayerUserGroupJob, 'correlationId' | 'timestamp'>,
): Promise<void> {
  try {
    const payload = UpdatePlayerUserGroupJobSchema.parse({
      ...data,
      correlationId: randomUUID(),
      timestamp: new Date(),
    })

    await discordUpdateGroupQueue.add('updateGroup', payload, {
      priority: JobPriority.NORMAL,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    })
  } catch (error) {
    console.error(`[bullmq] Failed to queue updateGroup: ${(error as Error).message}`)
    throw error
  }
}

/**
 * Enqueue: Synchroniser team role Discord
 */
export async function enqueueUpdateDiscordTeamRole(
  data: Omit<UpdateDiscordTeamRoleJob, 'correlationId' | 'timestamp'>,
): Promise<void> {
  try {
    const payload = UpdateDiscordTeamRoleJobSchema.parse({
      ...data,
      correlationId: randomUUID(),
      timestamp: new Date(),
    })

    await discordUpdateTeamRoleQueue.add('updateTeamRole', payload, {
      priority: JobPriority.NORMAL,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    })
  } catch (error) {
    console.error(`[bullmq] Failed to queue updateTeamRole: ${(error as Error).message}`)
    throw error
  }
}

export async function enqueueMainClientHasGuild(guildID: string, timeoutMs = 5000): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = MainClientHasGuildJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  })

  await discordMainClientOpsQueue.add('mainClientHasGuild', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => MainClientHasGuildReplySchema.parse(value), timeoutMs)

  return reply.hasGuild
}

export async function enqueueMainClientUploadScreenshot(
  data: Omit<MainClientUploadScreenshotJob, 'correlationId' | 'timestamp'>,
  timeoutMs = 7000,
): Promise<string> {
  const correlationId = randomUUID()
  const payload = MainClientUploadScreenshotJobSchema.parse({
    ...data,
    correlationId,
    timestamp: new Date(),
  })

  await discordMainClientOpsQueue.add('mainClientUploadScreenshot', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => MainClientUploadScreenshotReplySchema.parse(value),
    timeoutMs,
  )

  return reply.discordUrl
}

export async function enqueueMainClientFetchUser(
  discordID: string,
  timeoutMs = 5000,
): Promise<{ id: string; username: string; displayName: string; avatarURL: string | null } | null> {
  const correlationId = randomUUID()
  const payload = MainClientFetchUserJobSchema.parse({
    discordID,
    correlationId,
    timestamp: new Date(),
  })

  await discordMainClientOpsQueue.add('mainClientFetchUser', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => MainClientFetchUserReplySchema.parse(value), timeoutMs)
  return reply.user
}

export async function enqueueMainClientSyncPremiumRoles(timeoutMs = 10000): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = MainClientSyncPremiumRolesJobSchema.parse({
    correlationId,
    timestamp: new Date(),
  })

  await discordMainClientOpsQueue.add('mainClientSyncPremiumRoles', payload, {
    priority: JobPriority.BACKGROUND,
    attempts: 1,
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => MainClientSyncPremiumRolesReplySchema.parse(value),
    timeoutMs,
  )
  return reply.synced
}

export async function enqueueMainClientSetPresence(
  activityName: string,
  activityType = 3,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = MainClientSetPresenceJobSchema.parse({
    activityName,
    activityType,
    correlationId,
    timestamp: new Date(),
  })

  await discordMainClientOpsQueue.add('mainClientSetPresence', payload, {
    priority: JobPriority.BACKGROUND,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => MainClientSetPresenceReplySchema.parse(value), timeoutMs)
  return reply.updated
}

/** Resolve one public invitation per community, shared by all its listed game servers. */
export async function enqueueDiscordGuildPublicInvite(guildID: string, timeoutMs = 7000): Promise<string | null> {
  const cacheKey = `discord:publicInvite:${guildID}`
  const cached = await redis.get(cacheKey)
  if (cached !== null) {
    try {
      const parsed: unknown = JSON.parse(cached)
      if (parsed === null) return null
      const validated = DiscordPublicInviteUrlSchema.safeParse(parsed)
      if (validated.success) return validated.data
    } catch {
      // Malformed cache values are replaced by a validated worker reply.
    }
  }

  const pending = guildPublicInviteInFlight.get(guildID)
  if (pending) return await pending

  const request = (async () => {
    const correlationId = randomUUID()
    const payload = DiscordGuildPublicInviteJobSchema.parse({ guildID, correlationId, timestamp: new Date() })
    await discordGuildOpsQueue.add('guildPublicInvite', payload, {
      priority: JobPriority.INTERACTIVE,
      attempts: 1,
      removeOnComplete: true,
    })
    const reply = await waitForReply(
      correlationId,
      (value) => DiscordGuildPublicInviteReplySchema.parse(value),
      timeoutMs,
    )
    await redis.set(cacheKey, JSON.stringify(reply.inviteUrl), 'EX', reply.inviteUrl ? 3600 : 60)
    return reply.inviteUrl
  })()
  guildPublicInviteInFlight.set(guildID, request)
  try {
    return await request
  } finally {
    guildPublicInviteInFlight.delete(guildID)
  }
}

export async function enqueueDiscordGuildSnapshot(
  guildID: string,
  timeoutMs = 12000,
): Promise<DiscordGuildSummary | null> {
  const cached = getCachedGuildSnapshot(guildID)
  if (cached !== undefined) {
    return cached
  }

  const inFlight = guildSnapshotInFlight.get(guildID)
  if (inFlight) {
    return await inFlight
  }

  const requestPromise = (async () => {
    const correlationId = randomUUID()
    const payload = DiscordGuildSnapshotJobSchema.parse({
      guildID,
      correlationId,
      timestamp: new Date(),
    })

    await discordGuildOpsQueue.add('guildSnapshot', payload, {
      priority: JobPriority.INTERACTIVE,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
    })

    const reply = await waitForReply(correlationId, (value) => DiscordGuildSnapshotReplySchema.parse(value), timeoutMs)
    setCachedGuildSnapshot(guildID, reply.guild)
    return reply.guild
  })()

  guildSnapshotInFlight.set(guildID, requestPromise)

  try {
    return await requestPromise
  } finally {
    guildSnapshotInFlight.delete(guildID)
  }
}

export async function enqueueDiscordGuildVerifyUser(
  guildID: string,
  userID: string,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordGuildVerifyUserJobSchema.parse({
    guildID,
    userID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildVerifyUser', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => DiscordGuildVerifyUserReplySchema.parse(value), timeoutMs)
  return reply.verified
}

export async function enqueueDiscordGuildRunVerificationCheck(guildID: string, timeoutMs = 15000): Promise<number> {
  const correlationId = randomUUID()
  const payload = DiscordGuildRunVerificationCheckJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildRunVerificationCheck', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 1,
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildRunVerificationCheckReplySchema.parse(value),
    timeoutMs,
  )
  return reply.processed
}

export async function enqueueDiscordCreateVerificationMessage(
  guildID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<{ guildID: string; channelID: string; messageID: string } | null> {
  const correlationId = randomUUID()
  const payload = DiscordCreateVerificationMessageJobSchema.parse({
    guildID,
    channelID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('createVerificationMessage', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordCreateVerificationMessageReplySchema.parse(value),
    timeoutMs,
  )

  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.verifyMessage
}

export async function enqueueDiscordDeleteVerificationMessage(
  guildID: string,
  channelID: string,
  messageID: string,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordDeleteVerificationMessageJobSchema.parse({
    guildID,
    channelID,
    messageID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('deleteVerificationMessage', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordDeleteVerificationMessageReplySchema.parse(value),
    timeoutMs,
  )
  return reply.deleted
}

export async function enqueueDiscordGuildBotClientInfo(
  guildID: string,
  timeoutMs = 7000,
): Promise<{ id: string; username: string; avatar: string | null; custom: boolean; onGuild: boolean } | null> {
  const correlationId = randomUUID()
  const payload = DiscordGuildBotClientInfoJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildBotClientInfo', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildBotClientInfoReplySchema.parse(value),
    timeoutMs,
  )
  return reply.botInfo
}

export async function enqueueDiscordGuildReloadBotInstance(guildID: string, timeoutMs = 10000): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordGuildReloadBotInstanceJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildReloadBotInstance', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildReloadBotInstanceReplySchema.parse(value),
    timeoutMs,
  )
  return reply.reloaded
}

export async function enqueueDiscordGuildUpdateBotProfile(
  data: { guildID: string; username?: string; avatar?: string },
  timeoutMs = 10000,
): Promise<{ updated: boolean; error?: string }> {
  const correlationId = randomUUID()
  const payload = DiscordGuildUpdateBotProfileJobSchema.parse({
    ...data,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildUpdateBotProfile', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildUpdateBotProfileReplySchema.parse(value),
    timeoutMs,
  )
  return {
    updated: reply.updated,
    error: reply.error,
  }
}

export async function enqueueDiscordGuildSyncBan(
  guildID: string,
  oldDiscordIDs: string[],
  newDiscordID: string,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordGuildSyncBanJobSchema.parse({
    guildID,
    oldDiscordIDs,
    newDiscordID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildSyncBan', payload, {
    priority: JobPriority.NORMAL,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => DiscordGuildSyncBanReplySchema.parse(value), timeoutMs)
  return reply.synced
}

export async function enqueueDiscordGuildAdmins(
  guildID: string,
  timeoutMs = 7000,
): Promise<Array<{ id: string; name: string; avatar: string | null }>> {
  const correlationId = randomUUID()
  const payload = DiscordGuildAdminsJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildAdmins', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => DiscordGuildAdminsReplySchema.parse(value), timeoutMs)
  if (!reply.available)
    throw Object.assign(new Error('Discord administrators are temporarily unavailable.'), {
      code: 'provider_unavailable',
      status: 503,
    })
  return reply.admins
}

export async function enqueueDiscordGuildMemberRole(
  guildID: string,
  discordID: string,
  roleID: string,
  timeoutMs = 7000,
): Promise<DiscordGuildMemberRoleResult> {
  const correlationId = randomUUID()
  const payload = DiscordGuildMemberRoleJobSchema.parse({
    guildID,
    discordID,
    roleID,
    correlationId,
    timestamp: new Date(),
  })
  await discordGuildOpsQueue.add('guildMemberRole', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 1,
    removeOnComplete: true,
  })
  const reply = await waitForReply(correlationId, (value) => DiscordGuildMemberRoleReplySchema.parse(value), timeoutMs)
  return { available: reply.available, hasRole: reply.hasRole, roleExists: reply.roleExists }
}

export async function enqueueDiscordGuildBans(
  guildID: string,
  timeoutMs = 7000,
): Promise<Array<{ id: string; tag: string; reason: string | null }>> {
  const correlationId = randomUUID()
  const payload = DiscordGuildBansJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildBans', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(correlationId, (value) => DiscordGuildBansReplySchema.parse(value), timeoutMs)
  return reply.bans
}

export async function enqueueDiscordGuildSendLogMessage(
  data: {
    guildID: string
    channelID: string
    title: string
    description?: string | null
    color: string
    footer: string
    requiredCapability?: 'logs.triggers'
  },
  timeoutMs = 5000,
): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordGuildSendLogMessageJobSchema.parse({
    ...data,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildSendLogMessage', payload, {
    priority: JobPriority.NORMAL,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildSendLogMessageReplySchema.parse(value),
    timeoutMs,
  )
  return reply.sent
}

/** Build the actual Discord payload without posting or persisting the draft. */
export async function enqueueDiscordServerStatusPreview(
  serverID: string,
  draft: StatusMessagePreviewInput,
  timeoutMs = 10000,
): Promise<StatusMessagePreview> {
  const correlationId = randomUUID()
  const payload = DiscordServerStatusPreviewJobSchema.parse({ serverID, draft, correlationId, timestamp: new Date() })
  await discordGuildOpsQueue.add('serverStatusPreview', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 1,
    removeOnComplete: true,
  })
  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerStatusPreviewReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) throw new Error(reply.error)
  if (!reply.preview) throw new Error('Status preview is unavailable')
  return reply.preview
}

export async function enqueueDiscordServerStatusCreate(
  serverID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<DiscordServerStatusRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerStatusCreateJobSchema.parse({
    serverID,
    channelID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('serverStatusCreate', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerStatusCreateReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.status
}

export async function enqueueDiscordServerStatusDelete(
  serverID: string,
  timeoutMs = 10000,
): Promise<DiscordServerStatusRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerStatusDeleteJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('serverStatusDelete', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerStatusDeleteReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.status
}

export async function enqueueDiscordServerLogsChannelCreate(
  serverID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<DiscordServerLogsChannelRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerLogsChannelCreateJobSchema.parse({
    serverID,
    channelID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('logsChannelCreate', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerLogsChannelCreateReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.logsChannel
}

export async function enqueueDiscordServerLogsChannelDelete(
  serverID: string,
  timeoutMs = 10000,
): Promise<DiscordServerLogsChannelRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerLogsChannelDeleteJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('logsChannelDelete', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerLogsChannelDeleteReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.logsChannel
}

export async function enqueueDiscordServerScreenshotChannelCreate(
  serverID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<DiscordServerScreenshotChannelRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerScreenshotChannelCreateJobSchema.parse({
    serverID,
    channelID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('screenshotChannelCreate', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerScreenshotChannelCreateReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.screenshotChannel
}

export async function enqueueDiscordServerScreenshotChannelDelete(
  serverID: string,
  timeoutMs = 10000,
): Promise<DiscordServerScreenshotChannelRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerScreenshotChannelDeleteJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('screenshotChannelDelete', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerScreenshotChannelDeleteReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.screenshotChannel
}

export async function enqueueDiscordServerVoteChannelCreate(
  serverID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<DiscordServerVoteChannelRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerVoteChannelCreateJobSchema.parse({
    serverID,
    channelID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('voteChannelCreate', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerVoteChannelCreateReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.voteChannel
}

export async function enqueueDiscordServerVoteChannelDelete(
  serverID: string,
  timeoutMs = 10000,
): Promise<DiscordServerVoteChannelRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerVoteChannelDeleteJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('voteChannelDelete', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerVoteChannelDeleteReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.voteChannel
}

export async function enqueueDiscordServerSyncChatCreate(
  serverID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<DiscordServerSyncChatRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerSyncChatCreateJobSchema.parse({
    serverID,
    channelID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('syncChatCreate', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerSyncChatCreateReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.syncChat
}

export async function enqueueDiscordServerSyncChatDelete(
  serverID: string,
  timeoutMs = 10000,
): Promise<DiscordServerSyncChatRecord | null> {
  const correlationId = randomUUID()
  const payload = DiscordServerSyncChatDeleteJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('syncChatDelete', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerSyncChatDeleteReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.syncChat
}

export async function enqueueDiscordGuildRemoveSyncRoles(
  guildID: string,
  discordID: string,
  candidateRoleIDs: string[],
  timeoutMs = 10000,
): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordGuildRemoveSyncRolesJobSchema.parse({
    guildID,
    discordID,
    candidateRoleIDs,
    correlationId,
    timestamp: new Date(),
  })

  await discordGuildOpsQueue.add('guildRemoveSyncRoles', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildRemoveSyncRolesReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.processed
}

/**
 * Explicit refresh requested from the dashboard: the API waits for the result,
 * so it jumps ahead of the automatic refreshes in the status queue.
 */
export async function enqueueDiscordServerStatusRefresh(serverID: string, timeoutMs = 10000): Promise<boolean> {
  const correlationId = randomUUID()
  const payload = DiscordServerStatusRefreshJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordStatusRefreshQueue.add('serverStatusRefresh', payload, {
    priority: JobPriority.INTERACTIVE,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  })

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordServerStatusRefreshReplySchema.parse(value),
    timeoutMs,
  )
  if (reply.error) {
    throw new Error(reply.error)
  }

  return reply.refreshed
}

/**
 * Automatic refresh after a server status post. Nobody waits on it, and the worker
 * always renders the server's latest status, so only one pending job per server is
 * ever useful:
 *  - throttled to one enqueue per server every STATUS_REFRESH_THROTTLE_MS;
 *  - deduplicated per server while a job is still pending or running.
 *
 * Returns the correlationId, or null when the refresh was skipped.
 */
export async function enqueueDiscordServerStatusRefreshAsync(serverID: string): Promise<string | null> {
  const throttled = await redis.set(
    `bullmq:statusRefresh:throttle:${serverID}`,
    '1',
    'PX',
    STATUS_REFRESH_THROTTLE_MS,
    'NX',
  )
  if (throttled !== 'OK') {
    return null
  }

  const correlationId = randomUUID()
  const payload = DiscordServerStatusRefreshJobSchema.parse({
    serverID,
    correlationId,
    timestamp: new Date(),
  })

  await discordStatusRefreshQueue.add('serverStatusRefresh', payload, {
    priority: JobPriority.BACKGROUND,
    // No ttl: the key is released as soon as the job completes or fails.
    deduplication: { id: `server-${serverID}` },
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  })

  return correlationId
}

export {
  discordUpdatePseudoQueue,
  discordUpdateGroupQueue,
  discordUpdateTeamRoleQueue,
  discordMainClientOpsQueue,
  discordGuildOpsQueue,
  discordStatusRefreshQueue,
}
