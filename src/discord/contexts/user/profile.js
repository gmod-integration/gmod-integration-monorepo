import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';

export default {
  data: new ContextMenuCommandBuilder().setName('Profile').setType(ApplicationCommandType.User),
  category: 'user',
  async execute(interaction) {
    // todo
  },
};
