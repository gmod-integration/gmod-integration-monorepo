import { Queue } from 'bullmq';
import { connection } from './index.js';
import {
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
  type UpdateGuildUserPseudoJob,
  type UpdatePlayerUserGroupJob,
  type UpdateDiscordTeamRoleJob,
  type MainClientUploadScreenshotJob,
  type DiscordGuildSummary,
} from './schemas.js';
import { v4 as uuidv4 } from 'uuid';
import redis from '@gmod/infra-redis';

// Queues
const discordUpdatePseudoQueue = new Queue('discord-updatePseudo', { connection });
const discordUpdateGroupQueue = new Queue('discord-updateGroup', { connection });
const discordUpdateTeamRoleQueue = new Queue('discord-updateTeamRole', { connection });
const discordMainClientOpsQueue = new Queue('discord-mainClientOps', { connection });
const discordGuildOpsQueue = new Queue('discord-guildOps', { connection });

function getReplyKey(correlationId: string): string {
  return `bullmq:reply:${correlationId}`;
}

async function waitForReply<T>(correlationId: string, parser: (value: unknown) => T, timeoutMs = 5000): Promise<T> {
  const key = getReplyKey(correlationId);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const raw = await redis.get(key);
    if (raw) {
      await redis.del(key);
      return parser(JSON.parse(raw));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for BullMQ reply (${correlationId})`);
}

/**
 * Enqueue: Synchroniser pseudo Discord
 */
export async function enqueueUpdateGuildUserPseudo(
  data: Omit<UpdateGuildUserPseudoJob, 'correlationId' | 'timestamp'>
): Promise<void> {
  try {
    const payload = UpdateGuildUserPseudoJobSchema.parse({
      ...data,
      correlationId: uuidv4(),
      timestamp: new Date(),
    });

    await discordUpdatePseudoQueue.add('updatePseudo', payload, {
      priority: 5, // Normal priority
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });

  } catch (error) {
    console.error(`[bullmq] Failed to queue updatePseudo: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Enqueue: Synchroniser groupe Discord
 */
export async function enqueueUpdatePlayerUserGroup(
  data: Omit<UpdatePlayerUserGroupJob, 'correlationId' | 'timestamp'>
): Promise<void> {
  try {
    const payload = UpdatePlayerUserGroupJobSchema.parse({
      ...data,
      correlationId: uuidv4(),
      timestamp: new Date(),
    });

    await discordUpdateGroupQueue.add('updateGroup', payload, {
      priority: 8, // Slightly higher priority than pseudo
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });

  } catch (error) {
    console.error(`[bullmq] Failed to queue updateGroup: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Enqueue: Synchroniser team role Discord
 */
export async function enqueueUpdateDiscordTeamRole(
  data: Omit<UpdateDiscordTeamRoleJob, 'correlationId' | 'timestamp'>
): Promise<void> {
  try {
    const payload = UpdateDiscordTeamRoleJobSchema.parse({
      ...data,
      correlationId: uuidv4(),
      timestamp: new Date(),
    });

    await discordUpdateTeamRoleQueue.add('updateTeamRole', payload, {
      priority: 8, // Slightly higher priority than pseudo
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });

  } catch (error) {
    console.error(`[bullmq] Failed to queue updateTeamRole: ${(error as Error).message}`);
    throw error;
  }
}

export async function enqueueMainClientHasGuild(guildID: string, timeoutMs = 5000): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = MainClientHasGuildJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  });

  await discordMainClientOpsQueue.add('mainClientHasGuild', payload, {
    priority: 10,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => MainClientHasGuildReplySchema.parse(value), timeoutMs);

  return reply.hasGuild;
}

export async function enqueueMainClientUploadScreenshot(
  data: Omit<MainClientUploadScreenshotJob, 'correlationId' | 'timestamp'>,
  timeoutMs = 7000,
): Promise<string> {
  const correlationId = uuidv4();
  const payload = MainClientUploadScreenshotJobSchema.parse({
    ...data,
    correlationId,
    timestamp: new Date(),
  });

  await discordMainClientOpsQueue.add('mainClientUploadScreenshot', payload, {
    priority: 6,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => MainClientUploadScreenshotReplySchema.parse(value),
    timeoutMs,
  );

  return reply.discordUrl;
}

export async function enqueueMainClientFetchUser(
  discordID: string,
  timeoutMs = 5000,
): Promise<{ id: string; username: string; displayName: string; avatarURL: string | null } | null> {
  const correlationId = uuidv4();
  const payload = MainClientFetchUserJobSchema.parse({
    discordID,
    correlationId,
    timestamp: new Date(),
  });

  await discordMainClientOpsQueue.add('mainClientFetchUser', payload, {
    priority: 9,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => MainClientFetchUserReplySchema.parse(value), timeoutMs);
  return reply.user;
}

export async function enqueueMainClientSyncPremiumRoles(timeoutMs = 10000): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = MainClientSyncPremiumRolesJobSchema.parse({
    correlationId,
    timestamp: new Date(),
  });

  await discordMainClientOpsQueue.add('mainClientSyncPremiumRoles', payload, {
    priority: 5,
    attempts: 1,
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => MainClientSyncPremiumRolesReplySchema.parse(value),
    timeoutMs,
  );
  return reply.synced;
}

export async function enqueueMainClientSetPresence(
  activityName: string,
  activityType = 3,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = MainClientSetPresenceJobSchema.parse({
    activityName,
    activityType,
    correlationId,
    timestamp: new Date(),
  });

  await discordMainClientOpsQueue.add('mainClientSetPresence', payload, {
    priority: 5,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => MainClientSetPresenceReplySchema.parse(value), timeoutMs);
  return reply.updated;
}

export async function enqueueDiscordGuildSnapshot(guildID: string, timeoutMs = 6000): Promise<DiscordGuildSummary | null> {
  const correlationId = uuidv4();
  const payload = DiscordGuildSnapshotJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildSnapshot', payload, {
    priority: 9,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => DiscordGuildSnapshotReplySchema.parse(value), timeoutMs);
  return reply.guild;
}

export async function enqueueDiscordGuildVerifyUser(
  guildID: string,
  userID: string,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = DiscordGuildVerifyUserJobSchema.parse({
    guildID,
    userID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildVerifyUser', payload, {
    priority: 7,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => DiscordGuildVerifyUserReplySchema.parse(value), timeoutMs);
  return reply.verified;
}

export async function enqueueDiscordGuildRunVerificationCheck(guildID: string, timeoutMs = 15000): Promise<number> {
  const correlationId = uuidv4();
  const payload = DiscordGuildRunVerificationCheckJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildRunVerificationCheck', payload, {
    priority: 6,
    attempts: 1,
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildRunVerificationCheckReplySchema.parse(value),
    timeoutMs,
  );
  return reply.processed;
}

export async function enqueueDiscordCreateVerificationMessage(
  guildID: string,
  channelID: string,
  timeoutMs = 10000,
): Promise<{ guildID: string; channelID: string; messageID: string } | null> {
  const correlationId = uuidv4();
  const payload = DiscordCreateVerificationMessageJobSchema.parse({
    guildID,
    channelID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('createVerificationMessage', payload, {
    priority: 7,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordCreateVerificationMessageReplySchema.parse(value),
    timeoutMs,
  );

  if (reply.error) {
    throw new Error(reply.error);
  }

  return reply.verifyMessage;
}

export async function enqueueDiscordDeleteVerificationMessage(
  guildID: string,
  channelID: string,
  messageID: string,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = DiscordDeleteVerificationMessageJobSchema.parse({
    guildID,
    channelID,
    messageID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('deleteVerificationMessage', payload, {
    priority: 7,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordDeleteVerificationMessageReplySchema.parse(value),
    timeoutMs,
  );
  return reply.deleted;
}

export async function enqueueDiscordGuildBotClientInfo(
  guildID: string,
  timeoutMs = 7000,
): Promise<{ id: string; username: string; avatar: string | null; custom: boolean; onGuild: boolean } | null> {
  const correlationId = uuidv4();
  const payload = DiscordGuildBotClientInfoJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildBotClientInfo', payload, {
    priority: 8,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildBotClientInfoReplySchema.parse(value),
    timeoutMs,
  );
  return reply.botInfo;
}

export async function enqueueDiscordGuildReloadBotInstance(guildID: string, timeoutMs = 10000): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = DiscordGuildReloadBotInstanceJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildReloadBotInstance', payload, {
    priority: 8,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildReloadBotInstanceReplySchema.parse(value),
    timeoutMs,
  );
  return reply.reloaded;
}

export async function enqueueDiscordGuildUpdateBotProfile(
  data: { guildID: string; username?: string; avatar?: string },
  timeoutMs = 10000,
): Promise<{ updated: boolean; error?: string }> {
  const correlationId = uuidv4();
  const payload = DiscordGuildUpdateBotProfileJobSchema.parse({
    ...data,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildUpdateBotProfile', payload, {
    priority: 8,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(
    correlationId,
    (value) => DiscordGuildUpdateBotProfileReplySchema.parse(value),
    timeoutMs,
  );
  return {
    updated: reply.updated,
    error: reply.error,
  };
}

export async function enqueueDiscordGuildSyncBan(
  guildID: string,
  oldDiscordIDs: string[],
  newDiscordID: string,
  timeoutMs = 7000,
): Promise<boolean> {
  const correlationId = uuidv4();
  const payload = DiscordGuildSyncBanJobSchema.parse({
    guildID,
    oldDiscordIDs,
    newDiscordID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildSyncBan', payload, {
    priority: 7,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => DiscordGuildSyncBanReplySchema.parse(value), timeoutMs);
  return reply.synced;
}

export async function enqueueDiscordGuildAdmins(
  guildID: string,
  timeoutMs = 7000,
): Promise<Array<{ id: string; name: string; avatar: string | null }>> {
  const correlationId = uuidv4();
  const payload = DiscordGuildAdminsJobSchema.parse({
    guildID,
    correlationId,
    timestamp: new Date(),
  });

  await discordGuildOpsQueue.add('guildAdmins', payload, {
    priority: 8,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
  });

  const reply = await waitForReply(correlationId, (value) => DiscordGuildAdminsReplySchema.parse(value), timeoutMs);
  return reply.admins;
}

export {
  discordUpdatePseudoQueue,
  discordUpdateGroupQueue,
  discordUpdateTeamRoleQueue,
  discordMainClientOpsQueue,
  discordGuildOpsQueue,
};
