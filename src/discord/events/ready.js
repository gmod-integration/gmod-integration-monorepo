import { getClient } from '../index.js';

export default {
  name: 'ready',
  async execute() {
    const client = await getClient();

    const guilds = client.guilds.cache;
    for (const [id, guild] of guilds) {
      console.log(id, guild.name, guild.memberCount, guild.preferredLocale);
    }
  },
};
