import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Leaderboard')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false)
    .setDMPermission(false),
  category: 'user',
  async execute(interaction) {
    // todo
  },
};
