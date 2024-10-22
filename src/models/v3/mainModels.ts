import redis from '../../redis';
import { ActivityType } from 'discord.js';
import { statusRoutine } from '../../classes/v3/Server.js';
import { getMainClient } from '../../discord';
import { serverConfig } from '../../config';
import { givePremiumRoleOfMainGuild } from './discordModels.js';
import prisma from '../../prisma';

export async function getStats() {
  const redisKey = 'stats';
  const redisStat = await redis.get(redisKey);
  if (redisStat !== null) {
    return JSON.parse(redisStat);
  }

  const usersCount = await prisma.users.count();
  const memberCountResult = await prisma.gm_guild.aggregate({
    _sum: {
      member: true,
    },
  });
  const memberCount = memberCountResult._sum.member || 0;
  const guildCount = await prisma.gm_guild.count();
  const serverCount = await prisma.gm_server.count();
  const verifiedUserCount = await prisma.gm_user.count({
    where: {
      steam: {
        not: null,
      },
    },
  });

  const stats = {
    verifyUser: verifiedUserCount,
    user: memberCount + usersCount,
    guild: guildCount,
    server: serverCount,
  };

  await redis.set(redisKey, JSON.stringify(stats), 'EX', 120);

  return stats;
}

export async function routineUpdateStatus() {
  const client = await getMainClient();
  const botStatusList = [
    async function userCount(stat: any) {
      return `${stat.user.toLocaleString()} users`;
    },
    function guildCount(stat: any) {
      return `${stat.guild.toLocaleString()} guilds`;
    },
    function serverCount(stat: any) {
      return `${stat.server.toLocaleString()} servers`;
    },
    function version() {
      return serverConfig.version;
    },
  ];

  let lastStatusID = 0;

  async function updateStatus() {
    const stats = await getStats();
    const status = botStatusList[lastStatusID];
    lastStatusID = (lastStatusID + 1) % botStatusList.length;

    client.user!.setPresence({
      activities: [
        {
          name: await status(stats),
          type: ActivityType.Watching,
        },
      ],
    });
  }

  // every 30s update the bot status
  setInterval(updateStatus, 30000);
  await updateStatus();
}

export async function routineServerStatusRefresh() {
  setInterval(statusRoutine, 30000);
  await statusRoutine();
}

function routPremiumRoleOfMainGuild() {
  givePremiumRoleOfMainGuild().then((err) => {
    if (err) {
      console.error('Error checking premium:', err);
    } else {
      console.log('Premium checked');
    }
  });
}

export async function routinePremiumRoleOfMainGuild() {
  setInterval(routPremiumRoleOfMainGuild, 60000);
  routPremiumRoleOfMainGuild();
}
