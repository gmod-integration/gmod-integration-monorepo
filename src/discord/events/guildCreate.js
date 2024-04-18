import { getConnectionPromise } from '../../database/connection.js';
import { gmLog } from '../../utils/logger.js';

export default {
  name: 'guildCreate',
  async execute(guild) {
    gmLog('event', `Bot joined guild: ${guild.name}`);
    const connection = await getConnectionPromise();
    const query = `INSERT INTO gm_guild(guild, name)
                   VALUES (?, ?)
                   ON DUPLICATE KEY UPDATE guild = ?`;
    connection.query(query, [guild.id, guild.name, guild.name], (err) => {
      if (err) throw err;
    });
  },
};
