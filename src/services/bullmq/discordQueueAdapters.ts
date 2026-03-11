import { Queue } from 'bullmq';
import { connection } from './index.js';
import {
  UpdateGuildUserPseudoJobSchema,
  UpdatePlayerUserGroupJobSchema,
  UpdateDiscordTeamRoleJobSchema,
  type UpdateGuildUserPseudoJob,
  type UpdatePlayerUserGroupJob,
  type UpdateDiscordTeamRoleJob,
} from './schemas.js';
import { v4 as uuidv4 } from 'uuid';
import { gmLog } from '../../utils/logger.js';

// Queues
const discordUpdatePseudoQueue = new Queue('discord-updatePseudo', { connection });
const discordUpdateGroupQueue = new Queue('discord-updateGroup', { connection });
const discordUpdateTeamRoleQueue = new Queue('discord-updateTeamRole', { connection });

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

export { discordUpdatePseudoQueue, discordUpdateGroupQueue, discordUpdateTeamRoleQueue };
