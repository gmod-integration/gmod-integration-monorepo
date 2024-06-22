import redis from '../../redis/index.js';
import gm_guild from '../../database/schema/gm_guild.js';
import Users from '../../database/schema/Users.js';
import gm_server from '../../database/schema/gm_server.js';
import { Op } from 'sequelize';
import gm_user from '../../database/schema/gm_user.js';

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
