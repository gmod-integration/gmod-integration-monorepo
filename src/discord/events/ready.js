import { getClient } from '../index.js';
import gm_guild from '../../database/shema/gm_guild.js';

export default {
  name: 'ready',
  async execute() {
    const client = await getClient();

    const guilds = client.guilds.cache;
    for (const [id, guild] of guilds) {
      const guildDB = await gm_guild.findOne({
        where: {
          guild: id,
        },
      });

      if (!guildDB) {
        await gm_guild.create({
          guild: id,
          name: guild.name,
          member: guild.memberCount,
          language: guild.preferredLocale,
        });
      } else {
        guildDB.member = guild.memberCount;
        guildDB.language = guild.preferredLocale;
        guildDB.name = guild.name;
        await guildDB.save();
      }
    }
  },
};
