import {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { ButtonDiscordSupport, ButtonInviteBot, ButtonWebsite } from '../../utils/buttons.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Open the help menu.').setDMPermission(false),
  category: 'general',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;

    const helpCategories = ['verification', 'setup', 'premium', 'contributing', 'features', 'legal', 'support'];

    const select = new StringSelectMenuBuilder().setCustomId('help').setPlaceholder(getTranslate('help_select', lang));

    // for every category, add an option to the select menu
    helpCategories.forEach((category) => {
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(getTranslate('help_' + category, lang))
          .setDescription(getTranslate('help_' + category + '_desc', lang))
          .setValue(category),
      );
    });

    const butWebsite = new ButtonWebsite();
    const butDiscordSupport = new ButtonDiscordSupport();
    const butInviteBot = new ButtonInviteBot();

    // made 2 rows of buttons
    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(butWebsite, butDiscordSupport, butInviteBot);

    await interaction.reply({
      content: getTranslate('help_default', lang),
      components: [row1, row2],
    });
  },
};
