import { getClient } from '../index.js';
import gm_guild from '../../database/schema/gm_guild.js';
import { getStats } from '../../models/v3/mainModels.js';
import { ActivityType } from 'discord.js';

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

    const botStatusList = [
      async function userCount(stat) {
        return client.user.setPresence({
          activities: [
            {
              name: `${stat.user.toLocaleString()} users`,
              type: ActivityType.Watching,
            },
          ],
        });
      },
      function serverCount(stat) {
        return client.user.setPresence({
          activities: [
            {
              name: `${stat.server.toLocaleString()} servers`,
              type: ActivityType.Watching,
            },
          ],
        });
      },
      function version() {
        return client.user.setPresence({
          activities: [
            {
              name: 'v0.3.4',
              type: ActivityType.Watching,
            },
          ],
        });
      },
    ];

    let lastStatusID = 0;

    async function updateStatus() {
      const stats = await getStats();
      const status = botStatusList[lastStatusID];
      lastStatusID = (lastStatusID + 1) % botStatusList.length;
      const rtn = await status(stats);
      console.log(`Status updated`);
      console.log(rtn);
    }

    // every 30s update the bot status
    setInterval(updateStatus, 30000);
    await updateStatus();
  },
};
