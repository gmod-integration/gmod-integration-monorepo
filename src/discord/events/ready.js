import { getClient } from '../index.js';
import gm_guild from '../../database/schema/gm_guild.js';

export default {
  name: 'ready',
  async execute() {
    const client = await getClient();

    const guilds = client.guilds.cache;
    for (const [id, guild] of guilds) {
      const dbGuild = await gm_guild.findOne({
        where: {
          guild: id,
        },
      });

      if (dbGuild) {
        dbGuild.member = guild.memberCount;
        dbGuild.language = guild.preferredLocale;
        dbGuild.name = guild.name;
        await dbGuild.save();
      } else {
        await gm_guild.create({
          guild: id,
          name: guild.name,
          member: guild.memberCount,
          language: guild.preferredLocale,
        });
      }
    }
  },
};
