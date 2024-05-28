import { getConnectionPromise } from '../../database/connection.js';
import redis from '../../redis/index.js';
import gm_guild from '../../database/schema/gm_guild.js';

export async function getStats() {
  const redisKey = 'stats';
  const redisStat = await redis.get(redisKey);
  if (redisStat !== null) {
    return JSON.parse(redisStat);
  }

  const connection = await getConnectionPromise();
  const [rows] = await connection.query('SELECT COUNT(*) FROM gm_user WHERE steam IS NOT NULL');
  const [rows2] = await connection.query('SELECT COUNT(*) FROM users');
  const [rows4] = await connection.query('SELECT COUNT(*) FROM gm_server');

  const memberCount = await gm_guild.sum('member');
  const guildCount = await gm_guild.count();

  const stats = {
    verifyUser: rows[0]['COUNT(*)'],
    user: memberCount + rows2[0]['COUNT(*)'],
    guild: guildCount,
    server: rows4[0]['COUNT(*)'],
  };

  await redis.set(redisKey, JSON.stringify(stats), 'EX', 120);

  return stats;
}
