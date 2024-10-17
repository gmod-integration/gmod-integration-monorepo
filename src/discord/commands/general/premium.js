import { SlashCommandBuilder } from 'discord.js';
import { isGuildPremium, replyNeedPremium } from '../../../classes/v3/Guild.js';
import { getTranslate } from '../../../utils/localizations.ts';

export default {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Check if your guild is premium.')
    .setDMPermission(false),
  category: 'other',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;

    if (await isGuildPremium(interaction.guild.id)) {
      return await interaction.reply({ content: await getTranslate('your_guild_is_premium', lang), ephemeral: true });
    } else {
      return await replyNeedPremium(interaction);
    }
  },
};
