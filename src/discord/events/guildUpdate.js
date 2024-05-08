import { gmLog } from '../../utils/logger.js';
import gm_guild from '../../database/shema/gm_guild.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    if (oldGuild.name === newGuild.name) return;

    gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`);

    const editedGuild = await gm_guild.findOne({
      where: {
        guild: newGuild.id,
      },
    });

    if (editedGuild) {
      editedGuild.name = newGuild.name;
      await editedGuild.save();
    }
  },
};
