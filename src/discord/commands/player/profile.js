import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { getProfileMessage } from '../../utils/messages.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Display your profile or another user's profile.")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's profile you want to display").setRequired(false),
    ),
  category: 'player',
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    return interaction.reply(await getProfileMessage(interaction.guild, user));
  },
};
