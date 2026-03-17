import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type ContextMenuCommandType,
  InteractionContextType,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import { getProfileMessage } from '@/discord/utils/messages.js';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Profile')
    .setContexts([InteractionContextType.Guild])
    .setType(ApplicationCommandType.User as ContextMenuCommandType),
  category: 'user',
  async execute(interaction: UserContextMenuCommandInteraction) {
    const user = interaction.options.getUser('user');
    if (!interaction.guild || !user) return interaction.reply('Something went wrong!');
    return interaction.reply(await getProfileMessage(interaction.guild, user));
  },
};
