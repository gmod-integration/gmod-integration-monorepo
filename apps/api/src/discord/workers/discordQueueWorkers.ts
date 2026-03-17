import { Worker, Job } from 'bullmq';
import { connection } from '@gmod/infra-bullmq';
import { s3 } from '@gmod/infra-minio';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  type UpdateGuildUserPseudoJob,
  type UpdatePlayerUserGroupJob,
  type UpdateDiscordTeamRoleJob,
  MainClientHasGuildJobSchema,
  MainClientUploadScreenshotJobSchema,
  type MainClientHasGuildJob,
  type MainClientUploadScreenshotJob,
} from '@gmod/infra-bullmq/schemas.js';
import { gmLog } from '@/utils/logger.js';
import prisma from '@gmod/infra-prisma';
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js';
import { getServerFromID } from '@gmod/domain-server/Server.js';
import { PermissionsBitField, Role } from 'discord.js';
import redis from '@gmod/infra-redis';
import { getMainClient } from '@/discord/index.js';

/**
 * Worker: synchroniser le pseudo Discord
 */
export const discordUpdatePseudoWorker = new Worker<UpdateGuildUserPseudoJob>(
  'discord-updatePseudo',
  async (job: Job<UpdateGuildUserPseudoJob>) => {
    const { serverID, steamID64, playerName, userGroup, forceName } = job.data;

    try {
      gmLog('bullmq-worker', `[updatePseudo] Processing job for ${steamID64} on server ${serverID}`);

      // Fetch server
      const server = await getServerFromID(serverID);
      if (!server) {
        gmLog('bullmq-worker', `[updatePseudo] Server not found: ${serverID}`);
        return;
      }

      // Check sync direction
      const pseudoDirection = await server.getSetting('sync_pseudo_direction');
      if (pseudoDirection !== 'both' && pseudoDirection !== 'gmod-to-discord') {
        gmLog('bullmq-worker', `[updatePseudo] Sync disabled for server ${serverID}`);
        return;
      }

      // Get pseudo format
      const pseudoFormat = await server.getSetting('pseudoFormat');
      if (!pseudoFormat) {
        gmLog('bullmq-worker', `[updatePseudo] No pseudo format configured for server ${serverID}`);
        return;
      }

      // Get role format
      const rolesFormat = await prisma.gm_server_pseudo.findFirst({
        where: {
          serverID,
          role: userGroup,
          enabled: true,
        },
      });

      // Build pseudo
      const newPseudo = pseudoFormat
        .replace(/{plyName}/g, forceName || playerName)
        .replace(/{plySteamID64}/g, steamID64)
        .replace(/{rolePrefix}/g, rolesFormat ? rolesFormat.prefix : '')
        .replace(/{roleName}/g, rolesFormat ? rolesFormat.name : '');

      // Fetch Discord user
      const user = await getUserFromSteamID64(steamID64);
      if (!user || !user.getDiscordID()) {
        gmLog('bullmq-worker', `[updatePseudo] User not found for steamID ${steamID64}`);
        return;
      }

      // Fetch bot instance
      const dscClient = await server.getBotInstance();
      if (!dscClient || !dscClient.user) {
        gmLog('bullmq-worker', `[updatePseudo] Bot instance not found for server ${serverID}`);
        return;
      }

      // Fetch guild
      const guild = dscClient.guilds.cache.get(server.getGuildID());
      if (!guild) {
        gmLog('bullmq-worker', `[updatePseudo] Guild not found: ${server.getGuildID()}`);
        return;
      }

      // Don't change guild owner nickname
      if (guild.ownerId === user.getDiscordID()) {
        gmLog('bullmq-worker', `[updatePseudo] Skipping guild owner ${user.getDiscordID()}`);
        return;
      }

      // Fetch member
      const member = await guild.members.fetch(user.getDiscordID()).catch(() => null);
      if (!member) {
        gmLog('bullmq-worker', `[updatePseudo] Member not found: ${user.getDiscordID()}`);
        return;
      }

      // Check bot permissions
      const botMember = await guild.members.fetch(dscClient.user.id).catch(() => null);
      if (!botMember) {
        gmLog('bullmq-worker', `[updatePseudo] Bot member not found in guild ${server.getGuildID()}`);
        return;
      }

      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        gmLog('bullmq-worker', `[updatePseudo] Bot has no ManageNicknames permission in ${server.getGuildID()}`);
        return;
      }

      if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        gmLog('bullmq-worker', `[updatePseudo] Bot role too low to manage ${user.getDiscordID()}`);
        return;
      }

      // Set nickname
      await member.setNickname(newPseudo);
      gmLog('bullmq-worker', `[updatePseudo] Set nickname for ${user.getDiscordID()} to ${newPseudo}`);

      // Cache result
      const redisKey = `sync-pseudo:gmod:server:${serverID}:user:${steamID64}`;
      await redis.set(redisKey, newPseudo, 'EX', 120);
    } catch (error) {
      gmLog('bullmq-worker', `[updatePseudo] Error: ${(error as Error).message}`);
      throw error;
    }
  },
  { connection, concurrency: 2 }
);

/**
 * Worker: synchroniser le groupe/rôle Discord
 */
export const discordUpdateGroupWorker = new Worker<UpdatePlayerUserGroupJob>(
  'discord-updateGroup',
  async (job: Job<UpdatePlayerUserGroupJob>) => {
    const { serverID, steamID64, userGroup } = job.data;

    try {
      gmLog('bullmq-worker', `[updateGroup] Processing job for ${steamID64} on server ${serverID}`);

      // Fetch server
      const server = await getServerFromID(serverID);
      if (!server) {
        gmLog('bullmq-worker', `[updateGroup] Server not found: ${serverID}`);
        return;
      }

      // Update DB
      const player = await prisma.gm_server_stat.findFirst({
        where: {
          steam_id: steamID64,
          server_id: serverID,
        },
      });

      if (player) {
        await prisma.gm_server_stat.update({
          where: {
            server_id_steam_id: {
              steam_id: steamID64,
              server_id: serverID,
            },
          },
          data: {
            rank: userGroup,
          },
        });
        gmLog('bullmq-worker', `[updateGroup] Updated DB for ${steamID64} to group ${userGroup}`);
      }

      // Sync roles to Discord (if applicable)
      const syncRoles = await server.getSyncRoles();
      if (syncRoles && syncRoles.length > 0) {
        const user = await getUserFromSteamID64(steamID64);
        if (user && user.getDiscordID()) {
          const dscClient = await server.getBotInstance();
          if (dscClient && dscClient.user) {
            const guild = dscClient.guilds.cache.get(server.getGuildID());
            if (guild) {
              const member = await guild.members.fetch(user.getDiscordID()).catch(() => null);
              if (member) {
                // Find roles for this group
                const groupRoles = syncRoles.filter((r: typeof syncRoles[0]) => r.userGroup === userGroup && r.enable);
                const botMember = await guild.members.fetch(dscClient.user.id).catch(() => null);

                if (botMember) {
                  // Remove all existing sync roles
                  const currentSyncRoles = member.roles.cache.filter((r: Role) =>
                    syncRoles.some((sr) => sr.roleID === r.id)
                  );

                  if (currentSyncRoles.size > 0) {
                    await member.roles.remove(Array.from(currentSyncRoles.keys()));
                    gmLog('bullmq-worker', `[updateGroup] Removed ${currentSyncRoles.size} roles from ${user.getDiscordID()}`);
                  }

                  // Add new roles
                  for (const groupRole of groupRoles) {
                    const role = guild.roles.cache.get(groupRole.roleID);
                    if (role && botMember.roles.highest.comparePositionTo(role) > 0) {
                      await member.roles.add(groupRole.roleID);
                      gmLog('bullmq-worker', `[updateGroup] Added role ${groupRole.roleID} to ${user.getDiscordID()}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      gmLog('bullmq-worker', `[updateGroup] Error: ${(error as Error).message}`);
      throw error;
    }
  },
  { connection, concurrency: 2 }
);

/**
 * Worker: synchroniser le team role Discord
 */
export const discordUpdateTeamRoleWorker = new Worker<UpdateDiscordTeamRoleJob>(
  'discord-updateTeamRole',
  async (job: Job<UpdateDiscordTeamRoleJob>) => {
    const { serverID, steamID64, teamName } = job.data;

    try {
      gmLog('bullmq-worker', `[updateTeamRole] Processing job for ${steamID64} on server ${serverID}`);

      // Fetch server
      const server = await getServerFromID(serverID);
      if (!server) {
        gmLog('bullmq-worker', `[updateTeamRole] Server not found: ${serverID}`);
        return;
      }

      // Fetch user
      const user = await getUserFromSteamID64(steamID64);
      if (!user) {
        gmLog('bullmq-worker', `[updateTeamRole] User not found for steamID ${steamID64}`);
        return;
      }

      // Fetch bot instance
      const dscClient = await server.getBotInstance();
      if (!dscClient || !dscClient.user) {
        gmLog('bullmq-worker', `[updateTeamRole] Bot instance not found for server ${serverID}`);
        return;
      }

      // Fetch guild
      const guild = await server.getDiscordGuild();
      if (!guild) {
        gmLog('bullmq-worker', `[updateTeamRole] Guild not found: ${server.getGuildID()}`);
        return;
      }

      // Fetch member
      const member = await guild.members.fetch(user.getDiscordID()).catch(() => null);
      if (!member) {
        gmLog('bullmq-worker', `[updateTeamRole] Member not found: ${user.getDiscordID()}`);
        return;
      }

      // Get sync team roles
      const syncRoles = await server.getSyncTeamRoles();
      if (!syncRoles || syncRoles.length === 0) {
        gmLog('bullmq-worker', `[updateTeamRole] No team roles configured for server ${serverID}`);
        return;
      }

      // Find roles for this team
      const teamRoles = syncRoles.filter((role: typeof syncRoles[0]) => role.teamName === teamName && role.enable);

      // Check bot permissions
      const botMember = guild.members.cache.get(dscClient.user.id);
      if (!botMember) {
        gmLog('bullmq-worker', `[updateTeamRole] Bot member not found in guild ${server.getGuildID()}`);
        return;
      }

      const botRole = botMember.roles.highest;
      if (!botRole) {
        gmLog('bullmq-worker', `[updateTeamRole] Bot has no roles in guild ${server.getGuildID()}`);
        return;
      }

      // Filter out roles the bot can't assign
      const assignableRoles = teamRoles.filter((tr: typeof teamRoles[0]) => {
        const role = guild.roles.cache.get(tr.roleID);
        return role && botRole.comparePositionTo(role) > 0;
      });

      // Find roles to remove
      const rolesToRemove = member.roles.cache.filter(
        (role: Role) =>
          syncRoles.some((syncRole) => syncRole.roleID === role.id) &&
          !assignableRoles.some((ar) => ar.roleID === role.id)
      );

      if (rolesToRemove.size > 0) {
        await member.roles.remove(Array.from(rolesToRemove.keys()));
        gmLog(
          'bullmq-worker',
          `[updateTeamRole] Removed ${rolesToRemove.size} roles from ${member.user.tag}`
        );
      }

      // Add new roles
      for (const teamRole of assignableRoles) {
        if (!member.roles.cache.has(teamRole.roleID)) {
          await member.roles.add(teamRole.roleID);
          gmLog('bullmq-worker', `[updateTeamRole] Added role to ${member.user.tag}: ${teamRole.roleID}`);
        }
      }
    } catch (error) {
      gmLog('bullmq-worker', `[updateTeamRole] Error: ${(error as Error).message}`);
      throw error;
    }
  },
  { connection, concurrency: 2 }
);

export const discordMainClientOpsWorker = new Worker<MainClientHasGuildJob | MainClientUploadScreenshotJob>(
  'discord-mainClientOps',
  async (job: Job<MainClientHasGuildJob | MainClientUploadScreenshotJob>) => {
    if (job.name === 'mainClientHasGuild') {
      const payload = MainClientHasGuildJobSchema.parse(job.data);
      const mainClient = await getMainClient();
      const hasGuild = mainClient.guilds.cache.has(payload.guildID);

      await redis.set(
        `bullmq:reply:${payload.correlationId}`,
        JSON.stringify({ correlationId: payload.correlationId, hasGuild }),
        'EX',
        30,
      );
      return;
    }

    if (job.name === 'mainClientUploadScreenshot') {
      const payload = MainClientUploadScreenshotJobSchema.parse(job.data);
      let discordUrl = '';

      try {
        // Fetch file from Minio
        const s3Response = await s3.send(
          new GetObjectCommand({
            Bucket: 'gmi-players-screenshots',
            Key: payload.minioKey,
          }),
        );

        if (!s3Response.Body) {
          throw new Error('No file content from Minio');
        }

        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        const reader = s3Response.Body as AsyncIterable<Uint8Array>;
        for await (const chunk of reader) {
          chunks.push(chunk);
        }
        const fileBuffer = Buffer.concat(chunks);

        // Upload to Discord
        const mainClient = await getMainClient();
        const channel = await mainClient.channels.fetch(payload.channelID);
        if (channel && channel.isSendable()) {
          const message = await channel.send({
            content: payload.content,
            files: [
              {
                attachment: fileBuffer,
                name: payload.fileName,
              },
            ],
          });
          discordUrl = message.attachments.first()?.url || '';
        }
      } catch (error) {
        gmLog('bullmq-worker', `[mainClientUploadScreenshot] Error: ${(error as Error).message}`);
      }

      await redis.set(
        `bullmq:reply:${payload.correlationId}`,
        JSON.stringify({ correlationId: payload.correlationId, discordUrl }),
        'EX',
        30,
      );
    }
  },
  { connection, concurrency: 2 },
);

/**
 * Initialize all Discord queue workers
 */
export async function initializeDiscordQueueWorkers() {
  gmLog('bullmq', 'Initializing Discord queue workers...');

  discordUpdatePseudoWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[updatePseudo] Job completed: ${job.id}`);
  });

  discordUpdatePseudoWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[updatePseudo] Job failed: ${job?.id} - ${err.message}`);
  });

  discordUpdateGroupWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[updateGroup] Job completed: ${job.id}`);
  });

  discordUpdateGroupWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[updateGroup] Job failed: ${job?.id} - ${err.message}`);
  });

  discordUpdateTeamRoleWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[updateTeamRole] Job completed: ${job.id}`);
  });

  discordUpdateTeamRoleWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[updateTeamRole] Job failed: ${job?.id} - ${err.message}`);
  });

  discordMainClientOpsWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[mainClientOps] Job completed: ${job.id}`);
  });

  discordMainClientOpsWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[mainClientOps] Job failed: ${job?.id} - ${err.message}`);
  });

  gmLog('bullmq', 'Discord queue workers initialized');
}
