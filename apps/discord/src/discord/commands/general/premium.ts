import { type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { isGuildPremium, replyNeedPremium } from '@gmod/domain-guild/Guild.js';
import { getTranslate } from '@gmod/core/utils/localizations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Check if your guild is premium.')
    .setContexts([InteractionContextType.Guild]),
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
