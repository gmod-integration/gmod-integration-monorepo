import '@gmod/core/utils/update-log.js';
import { gmLog } from '@gmod/core/utils/logger.js';
import { gracefulShutdownMongo } from '@gmod/core/database/gm_server_logs.js';
import { gracefulShutdownPrisma } from '@gmod/infra-prisma';
import { gracefulShutdownRedis } from '@gmod/infra-redis';
import '@gmod/infra-bullmq';
import { gracefulShutdownDiscord, getGuildClient, loadDiscordMain, loadDiscordSlave } from './discord/index.js';
import { initializeDiscordQueueWorkers } from './discord/workers/discordQueueWorkers.js';
import { setDiscordGuildClientResolver, setDiscordStatusMessageBuilder } from '@gmod/domain-server/discordBridge.js';
import { getStatusMessage } from './discord/utils/messages.js';

let inShutdown = false;

setDiscordGuildClientResolver(async (guildID: string, forcePresenceOnGuild = true) => {
  return await getGuildClient(guildID, forcePresenceOnGuild);
});
setDiscordStatusMessageBuilder(getStatusMessage);

async function runDiscord() {
  await loadDiscordMain();
  await loadDiscordSlave();
  await initializeDiscordQueueWorkers();
}

await runDiscord();

process.on('unhandledRejection', (error: Error) => {
  gmLog('unhandledRejection', error.message, true);
  console.error(error);
});

async function gracefulShutdown() {
  if (inShutdown) return;
  inShutdown = true;
  gmLog('shutdown', 'Gracefully shutting down discord app...');
  await gracefulShutdownDiscord();
  await gracefulShutdownRedis();
  await gracefulShutdownPrisma();
  await gracefulShutdownMongo();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
