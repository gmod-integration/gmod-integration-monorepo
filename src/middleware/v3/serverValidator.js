import { getServerFromID } from '../../classes/v3/Server.js';

export default async (req, res, next) => {
  const { serverID } = req.params;
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith('Bearer '))
    return res.status(400).json({ error: 'invalid_authorization' });
  const token = authorization.split(' ')[1];

  const server = await getServerFromID(serverID);
  if (!server) return res.status(404).json({ error: 'server_not_found' });
  if (!server.isValidToken(token)) return res.status(401).json({ error: 'unauthorized' });

  req.server = server;
  return next();
};
