import { badArgument } from '../../utils/tools.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import gm_guild from '../../database/schema/gm_guild.js';

export default (req, res, next) => {
  const { serverID } = req.params;
  const { authorization } = req.headers;

  if (badArgument([serverID, authorization])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        serverID: !!serverID,
        authorization: !!authorization,
      },
    });
  }

  const token = authorization.split(' ')[1];
  getServerFromID(serverID)
    .then(async (server) => {
      if (!server) return res.status(404).json({ error: 'server_not_found' });
      if (!server.isValidToken(token)) return res.status(401).json({ error: 'unauthorized' });

      const guild = await gm_guild.findOne({
        where: {
          guild: server.guild,
        },
      });
      if (!guild) return res.status(404).json({ error: 'guild_not_found' });

      req.headers.guild = server.guild;
      req.server = server;

      return next();
    })
    .catch((err) => {
      console.error(err);
      if (err === 'invalid_server_id') return res.status(400).json({ error: 'invalid_server_id' });
      return res.status(500).json({ error: 'internal_server_error' });
    });
};
