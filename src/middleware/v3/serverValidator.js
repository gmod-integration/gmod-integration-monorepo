import { getServerFromID } from '../../classes/v3/Server.js';
import redis from '../../redis/index.js';

export default async (req, res, next) => {
  const { serverID } = req.params;
  const { authorization } = req.headers;

  const redisKey = `server:rate_limit:${serverID}`;
  const stats = await redis.get(redisKey);
  if (stats) {
    if (stats >= 20) {
      console.log('Rate limit exceeded for serverID:', serverID);
      return res.status(429).json({ error: 'rate_limit_exceeded' });
    }

    await redis.incr(redisKey);
  }
  await redis.set(redisKey, stats, 'EX', 3);

  if (!authorization || !authorization.startsWith('Bearer '))
    return res.status(400).json({ error: 'invalid_authorization' });
  const token = authorization.split(' ')[1];

  const server = await getServerFromID(serverID);
  if (!server) return res.status(404).json({ error: 'server_not_found' });
  if (!server.isValidToken(token)) return res.status(401).json({ error: 'unauthorized' });

  req.server = server;
  return next();
};
