import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { verifyUser } from '../../../models/v3/discordModels.js';
import { getVerifiedMessageAnswer } from '../../utils/messages.js';
import { getTranslate } from '../../../utils/localizations';

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Start the verification process for a user.')
    .addUserOption((option) => option.setName('user').setDescription('The user you want to verify').setRequired(false))
    .setDMPermission(false),
  category: 'admin',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const guild = interaction.client.guilds.cache.get(interaction.guild.id)!;
    const user1 = interaction.options.getUser('user') || interaction.user;
    const user = await guild.members.fetch(user1.id).catch(() => null);

    if (!user) return interaction.reply(await getTranslate('something_went_wrong', guild.preferredLocale));

    const isVerified = await verifyUser(guild, user);
    await interaction.reply(
      await getVerifiedMessageAnswer(isVerified, guild.preferredLocale, user, user.id === interaction.user.id),
    );
  },
};
