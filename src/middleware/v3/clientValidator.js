import { badArgument } from '../../utils/tools.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import crypto from 'crypto';
import redis from '../../redis/index.js';

export default async (req, res, next) => {
  const { serverID, clientID64 } = req.params;
  const { authorization } = req.headers;

  const redisKey = `client:rate_limit:${clientID64}`;
  const stats = await redis.get(redisKey);
  if (stats) {
    if (stats >= 2) {
      console.log('Rate limit exceeded for clientID64:', clientID64);
      return res.status(429).json({ error: 'rate_limit_exceeded' });
    }
    await redis.incr(redisKey);
  }
  await redis.set(redisKey, stats, 'EX', 3);

  if (badArgument([serverID, authorization, clientID64])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        serverID: !!serverID,
        authorization: !!authorization,
        clientID64: !!clientID64,
      },
    });
  }

  if (!authorization.startsWith('Bearer ')) return res.status(400).json({ error: 'invalid_authorization' });

  const token = authorization.split(' ')[1];
  const userID = authorization.split(' ')[2];

  const server = await getServerFromID(serverID);
  if (!server) return res.status(404).json({ error: 'server_not_found' });

  const hash = crypto.createHash('sha256');
  hash.update(`${clientID64}-${server.getPublicToken()}-${server.getToken()}-${userID}`);

  const tokenHash = hash.digest('hex');
  if (tokenHash !== token) {
    console.error('Unauthorized', tokenHash, token);
    return res.status(401).json({ error: 'unauthorized' });
  }

  req.headers.guild = server.guild;
  req.server = server;
  return next();
};
