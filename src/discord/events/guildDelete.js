import { getConnectionPromise } from '../../database/connection.js';
import { gmLog } from '../../utils/logger.js';

export default {
  name: 'guildDelete',
  async execute(guild) {
    gmLog('event', `Bot left guild: ${guild.name}`);
    const connection = await getConnectionPromise();
    const query = `DELETE
                   FROM gm_guild
                   WHERE guild = ?`;
    connection.query(query, [guild.id], (err) => {
      if (err) throw err;
    });
  },
};
