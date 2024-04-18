import { getConnectionPromise } from '../../database/connection.js';
import { gmLog } from '../../utils/logger.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    if (oldGuild.name === newGuild.name) return;

    gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`);
    const connection = await getConnectionPromise();
    const query = `UPDATE gm_guild
                   SET name = ?
                   WHERE guild = ?`;
    connection.query(query, [newGuild.name, newGuild.id], (err) => {
      if (err) throw err;
    });
  },
};
