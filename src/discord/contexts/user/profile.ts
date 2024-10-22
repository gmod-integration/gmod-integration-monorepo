import { ApplicationCommandType, ContextMenuCommandBuilder, ContextMenuCommandInteraction } from 'discord.js';
import { getProfileMessage } from '../../utils/messages.js';

export default {
  data: new ContextMenuCommandBuilder().setName('Profile').setType(ApplicationCommandType.User).setDMPermission(false),
  category: 'user',
  async execute(interaction: ContextMenuCommandInteraction) {
    const user = interaction.options.getUser('user') || interaction.user;
    return interaction.reply(await getProfileMessage(interaction.guild, user));
  },
};
