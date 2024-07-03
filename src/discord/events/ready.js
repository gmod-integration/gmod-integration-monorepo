import { getClient } from '../index.js';
import gm_guild from '../../database/schema/gm_guild.js';
import { getStats } from '../../models/v3/mainModels.js';
import { ActivityType } from 'discord.js';
import { statusRoutine } from '../../controllers/v3/serversControllers.js';

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
        dbGuild.changed('updatedAt', true);
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
        return `${stat.user.toLocaleString()} users`;
      },
      function guildCount(stat) {
        return `${stat.guild.toLocaleString()} guilds`;
      },
      function serverCount(stat) {
        return `${stat.server.toLocaleString()} servers`;
      },
      function version() {
        return `v0.3.6`;
      },
    ];

    let lastStatusID = 0;

    async function updateStatus() {
      const stats = await getStats();
      const status = botStatusList[lastStatusID];
      lastStatusID = (lastStatusID + 1) % botStatusList.length;

      client.user.setPresence({
        activities: [
          {
            name: await status(stats),
            type: ActivityType.Watching,
          },
        ],
      });
    }

    // every 30s update the bot status
    setInterval(updateStatus, 30000);
    await updateStatus();

    // every 5 minutes execute the server status routine
    setInterval(statusRoutine, 300000);
    await statusRoutine();
  },
};
