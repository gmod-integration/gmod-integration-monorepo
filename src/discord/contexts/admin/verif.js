import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';

export default {
  data: new ContextMenuCommandBuilder().setName('Verify').setType(ApplicationCommandType.User),
  category: 'admin',
  async execute(interaction) {
    // todo
  },
};
