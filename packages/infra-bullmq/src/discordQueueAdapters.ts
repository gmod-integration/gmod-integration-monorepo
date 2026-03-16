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
  type UpdateGuildUserPseudoJob,
  type UpdatePlayerUserGroupJob,
  type UpdateDiscordTeamRoleJob,
  type MainClientUploadScreenshotJob,
} from './schemas.js';
import { v4 as uuidv4 } from 'uuid';
import { gmLog } from '../../../src/utils/logger.js';
import redis from '@gmod/infra-redis/index.js';

// Queues
const discordUpdatePseudoQueue = new Queue('discord-updatePseudo', { connection });
const discordUpdateGroupQueue = new Queue('discord-updateGroup', { connection });
const discordUpdateTeamRoleQueue = new Queue('discord-updateTeamRole', { connection });
const discordMainClientOpsQueue = new Queue('discord-mainClientOps', { connection });

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

    gmLog('bullmq', `Queued updatePseudo for ${data.steamID64} on server ${data.serverID}`);
  } catch (error) {
    gmLog('bullmq', `Failed to queue updatePseudo: ${(error as Error).message}`);
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

    gmLog('bullmq', `Queued updateGroup for ${data.steamID64} on server ${data.serverID}`);
  } catch (error) {
    gmLog('bullmq', `Failed to queue updateGroup: ${(error as Error).message}`);
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

    gmLog('bullmq', `Queued updateTeamRole for ${data.steamID64} on server ${data.serverID}`);
  } catch (error) {
    gmLog('bullmq', `Failed to queue updateTeamRole: ${(error as Error).message}`);
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

export { discordUpdatePseudoQueue, discordUpdateGroupQueue, discordUpdateTeamRoleQueue, discordMainClientOpsQueue };
