import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { isGuildPremium, replyNeedPremium } from '../../../classes/v3/Guild';
import { getTranslate } from '../../../utils/localizations';

export default {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Check if your guild is premium.')
    .setDMPermission(false),
  category: 'other',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const lang = interaction.guild.preferredLocale;

    if (await isGuildPremium(interaction.guild.id)) {
      return await interaction.reply({ content: await getTranslate('your_guild_is_premium', lang), ephemeral: true });
    } else {
      return await replyNeedPremium(interaction);
    }
  },
};
