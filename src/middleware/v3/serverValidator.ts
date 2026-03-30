import { getServerFromID } from '../../classes/v3/Server.js';
import { NextFunction, Request, Response } from 'express';
import redis from '../../services/redis/index.js';
import { firstString } from '../../utils/http.js';

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { serverID } = req.params as Record<string, string>;
    const authorization = firstString(req.headers.authorization);

    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(400).json({ error: 'invalid_authorization' });
      return;
    }
    const token = authorization.split(' ')[1];

    const server = await getServerFromID(serverID);
    if (!server) {
      res.status(404).json({ error: 'server_not_found' });
      return;
    }

    if (!server.isValidToken(token)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const version = firstString(req.headers['gmod-integrations-version']);
    const redisKeyServerVersion = `server:${serverID}:version`;
    redis.set(redisKeyServerVersion, version);
    const redisKeyServerLastRequest = `server:${serverID}:last_request`;
    redis.set(redisKeyServerLastRequest, new Date().toISOString());

    req.server = server;
    return next();
  } catch (error) {
    return next(error);
  }
};
