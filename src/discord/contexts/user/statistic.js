import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';

export default {
  data: new ContextMenuCommandBuilder().setName('Statistic').setType(ApplicationCommandType.User),
  category: 'user',
  async execute(interaction) {
    // todo
  },
};
