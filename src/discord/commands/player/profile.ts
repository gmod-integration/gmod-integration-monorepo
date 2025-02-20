import { ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getProfileMessage } from '../../utils/messages.js';
import { getUserFromSteamID64 } from '../../../classes/v3/User.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Display your profile or another user's profile.")
    .setContexts([InteractionContextType.Guild])
    // from user
    .addUserOption((option) =>
      option.setName('user').setDescription('The discord user you want to display').setRequired(false),
    )
    // from steamID64
    .addStringOption((option) =>
      option.setName('steam').setDescription('The steamID64 of the user you want to display').setRequired(false),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user');
    if (user) {
      return interaction.reply(await getProfileMessage(interaction.guild, user));
    }

    const steamID64 = interaction.options.getString('steam');
    if (steamID64) {
      const user = await getUserFromSteamID64(steamID64);
      if (!user) {
        return interaction.reply({
          content: 'This steamID64 is not linked to any discord account.',
          flags: MessageFlags.Ephemeral,
        });
      }

      let discordUser;
      try {
        discordUser = await interaction.guild.members.fetch(user.discordID);
        discordUser = discordUser.user;
      } catch {
        discordUser = await interaction.client.users.fetch(user.discordID);
      }
      if (!discordUser) {
        return interaction.reply({
          content: 'We have an issue fetching the discord user.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply(await getProfileMessage(interaction.guild, discordUser));
    }

    return interaction.reply(await getProfileMessage(interaction.guild, interaction.user));
  },
};
