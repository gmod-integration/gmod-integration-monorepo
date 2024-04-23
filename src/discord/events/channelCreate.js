import { getConnectionPromise } from '../../database/connection.js';
import { gmLog } from '../../utils/logger.js';

export default {
  name: 'channelCreate',
  async execute(channel) {
    const guild = channel.guild;
    gmLog('event', `Channel created in guild: ${guild.name}`);
    
    const connection = await getConnectionPromise();
    const query = `SELECT *
                   FROM gm_role_auto
                   WHERE guild = ?`;
    const [results] = await connection.query(query, [guild.id]);
    if (results && results[0]) {
      const role = guild.roles.cache.get(results[0].id);
      if (!role) return;
      channel.permissionOverwrites.edit(role, { ViewChannel: false });
    }
  },
};
