import redis from '../../redis/index.js';
import gm_guild from '../../database/schema/gm_guild.js';
import Users from '../../database/schema/Users.js';
import gm_server from '../../database/schema/gm_server.js';
import { Op } from 'sequelize';
import gm_user from '../../database/schema/gm_user.js';
import { ActivityType } from 'discord.js';
import { statusRoutine } from '../../classes/v3/Server.js';
import { getMainClient } from '../../discord/index.js';
import { serverConfig } from '../../config/index.js';
import { givePremiumRoleOfMainGuild } from './discordModels.js';

export async function getStats() {
  const redisKey = 'stats';
  const redisStat = await redis.get(redisKey);
  if (redisStat !== null) {
    return JSON.parse(redisStat);
  }

  const usersCount = await Users.count();
  const memberCount = await gm_guild.sum('member');
  const guildCount = await gm_guild.count();
  const serverCount = await gm_server.count();
  const verifiedUserCount = await gm_user.count({
    where: {
      steam: {
        [Op.not]: null,
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

export async function updateGuildsInDB(client) {
  const guilds = client.guilds.cache;
  const updatePromises = [];

  for (const [id, guild] of guilds) {
    const updatePromise = (async () => {
      const dbGuild = await gm_guild.findOne({
        where: {
          guild: id,
        },
      });

      if (dbGuild) {
        dbGuild.member = guild.memberCount;
        dbGuild.language = guild.preferredLocale;
        dbGuild.name = guild.name;
        dbGuild.changed('updatedAt', true);
        await dbGuild.save();
      } else {
        await gm_guild.create({
          guild: id,
          name: guild.name,
          member: guild.memberCount,
          language: guild.preferredLocale,
        });
      }
    })();

    updatePromises.push(updatePromise);
  }

  // Execute all update operations concurrently
  await Promise.all(updatePromises);
}

export async function routineUpdateStatus() {
  const client = await getMainClient();
  const botStatusList = [
    async function userCount(stat) {
      return `${stat.user.toLocaleString()} users`;
    },
    function guildCount(stat) {
      return `${stat.guild.toLocaleString()} guilds`;
    },
    function serverCount(stat) {
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

    client.user.setPresence({
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
  await routPremiumRoleOfMainGuild();
}
