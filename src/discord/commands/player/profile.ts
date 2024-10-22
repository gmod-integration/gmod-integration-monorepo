import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { getProfileMessage } from '../../utils/messages';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Display your profile or another user's profile.")
    .setContexts([InteractionContextType.Guild])
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's profile you want to display").setRequired(false),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('user') || interaction.user;
    return interaction.reply(await getProfileMessage(interaction.guild, user));
  },
};
