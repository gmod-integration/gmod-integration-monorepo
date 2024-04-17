import { SlashCommandBuilder } from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { isGuildPremium } from '../../../classes/v3/Guild.js';

export default {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Check if your guild is premium.')
    .setDMPermission(false),
  category: 'other',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;

    if (await isGuildPremium(interaction.guild.id)) {
      return await interaction.reply({ content: getTranslate('your_guild_is_premium', lang), ephemeral: true });
    } else {
      return await interaction.reply({ content: getTranslate('your_guild_is_not_premium', lang), ephemeral: true });
    }
  },
};
