import { getServerFromID } from '../../classes/v3/Server.js';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { badArgument } from '../../utils/tools.js';
import redis from '@gmod/infra-redis/index.js';

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { serverID, clientID64 } = req.params;
    const { authorization } = req.headers;

    if (badArgument([serverID, authorization, clientID64])) {
      res.status(400).json({
        error: 'missing_arguments',
        args: {
          serverID: !!serverID,
          authorization: !!authorization,
          clientID64: !!clientID64,
        },
      });
      return;
    }

    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(400).json({ error: 'invalid_authorization' });
      return;
    }

    const token = authorization.split(' ')[1];
    const userID = authorization.split(' ')[2];

    const server = await getServerFromID(serverID);
    if (!server) {
      res.status(404).json({ error: 'server_not_found' });
      return;
    }

    const hash = crypto.createHash('sha256');
    hash.update(`${clientID64}-${server.getPublicToken()}-${server.getToken()}-${userID}`);

    const tokenHash = hash.digest('hex');
    if (tokenHash !== token) {
      console.error('Unauthorized', tokenHash, token);
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    // if user send more than 1 request per second we block him for 5 seconds and if he continue we block him for 24 hours
    const keyClientRequestCount5s = `client_request_count_1s_${clientID64}`;
    const keyClientRequestCount60s = `client_request_count_60s_${clientID64}`;
    const keyClientRequestBlock = `client_request_block_${clientID64}`;

    const count5s = await redis.get(keyClientRequestCount5s);
    const count60s = await redis.get(keyClientRequestCount60s);
    const block = await redis.get(keyClientRequestBlock);

    if (block) {
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }

    if (!count5s) {
      await redis.set(keyClientRequestCount5s, 1, 'EX', 1);
    } else {
      await redis.incr(keyClientRequestCount5s);
    }

    if (!count60s) {
      await redis.set(keyClientRequestCount60s, 1, 'EX', 60);
    } else {
      await redis.incr(keyClientRequestCount60s);
    }

    if (parseInt(count5s) > 3) {
      await redis.set(keyClientRequestBlock, 1, 'EX', 60);
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }

    if (parseInt(count60s) > 10) {
      await redis.set(keyClientRequestBlock, 1, 'EX', 60 * 60 * 24);
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }

    req.headers.guild = server.guild;
    req.server = server;

    return next();
  } catch (error) {
    return next(error);
  }
};
