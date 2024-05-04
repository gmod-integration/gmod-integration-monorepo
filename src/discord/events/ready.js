import { getConnectionPromise } from '../../database/connection.js';
import { gmLog } from '../../utils/logger.js';
import { getClient } from '../index.js';

export default {
  name: 'ready',
  async execute() {
    const client = await getClient();
    const connection = await getConnectionPromise();
    const query = `INSERT INTO gm_guild(guild, name, member, language)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE name = ?, member = ?, language = ?`;
    client.guilds.cache.forEach(async (guild) => {
      gmLog('guild', `Bot connected to guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members and language ${guild.preferredLocale}`);
      await connection.query(query, [guild.id, guild.name, guild.memberCount, guild.preferredLocale, guild.name, guild.memberCount, guild.preferredLocale], (err) => {
        if (err) {
          gmLog('error', `Error updating guild: ${guild.name} (${guild.id})`);
          throw err;
        } else {
          gmLog('database', `Guild updated: ${guild.name} (${guild.id})`);
        }
      });
    });
  }
};
