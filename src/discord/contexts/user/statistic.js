import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { getUserStatisticMessage } from '../../utils/messages.js';

export default {
  data: new ContextMenuCommandBuilder().setName('Statistic').setType(ApplicationCommandType.User),
  category: 'user',
  async execute(interaction) {
    const user = interaction.user;

    const message = await getUserStatisticMessage(user, 'global', interaction.guild);
    return interaction.reply(message);
  },
};
