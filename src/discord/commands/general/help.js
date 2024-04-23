import {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { ButtonDiscordSupport, ButtonInviteBot, ButtonWebsite } from '../../utils/buttons.js';
import { getTranslate } from '../../../utils/localizations.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Open the help menu.').setDMPermission(false),
  category: 'general',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;
    const helpCategories = ['verification', 'setup', 'premium', 'contributing', 'features', 'legal', 'support'];
    const select = new StringSelectMenuBuilder()
      .setCustomId('help')
      .setPlaceholder(await getTranslate('help_select', lang));

    for (const category of helpCategories) {
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(await getTranslate('help_' + category, lang))
          .setDescription(await getTranslate('help_' + category + '_desc', lang))
          .setValue(category),
      );
    }

    const butWebsite = await ButtonWebsite();
    const butDiscordSupport = await ButtonDiscordSupport();
    const butInviteBot = await ButtonInviteBot();

    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(butWebsite, butDiscordSupport, butInviteBot);

    await interaction.reply({
      content: await getTranslate('help_default', lang),
      components: [row1, row2],
    });
  },
};
