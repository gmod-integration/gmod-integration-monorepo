import { getServerFromID } from '../../classes/v3/Server.js';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { badArgument } from '../../utils/tools';

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

    req.headers.guild = server.guild;
    req.server = server;

    return next();
  } catch (error) {
    return next(error);
  }
};
