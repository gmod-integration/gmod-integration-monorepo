import { SlashCommandBuilder } from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { getGuildLinks } from '../../../classes/v3/Guild.js';

export default {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Select a link to get.')
    .addStringOption((option) =>
      option.setName('link').setDescription('The link to get.').setRequired(true).setAutocomplete(true),
    )
    .setDMPermission(false),
  category: 'general',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;
    const linkID = interaction.options.getString('link');
    const linkInfo = await getGuildLink(interaction.guild.id, linkID);

    if (!linkInfo) {
      if (interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
          content:
            getTranslate('the_link_to_not_set', lang, ['`' + linkID + '`']) +
            '\n' +
            getTranslate('how_to_set_the_link', lang, ['gmod-integration']),
          ephemeral: true,
        });
      }

      return await interaction.reply({
        content: getTranslate('the_link_to_not_set', lang, ['`' + linkID + '`']),
        ephemeral: true,
      });
    }

    return await interaction.reply({
      content: getTranslate('the_link_to', lang, ['[' + linkInfo.alias + '](' + linkInfo.url + ')']),
    });
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const choices = {};

    const guildLinks = await getGuildLinks(interaction.guild.id);
    guildLinks.forEach((link) => {
      choices[link.id] = link.alias;
    });

    const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));
    await interaction.respond(filtered.map((choice) => ({ name: choices[choice], value: choice })));
  },
};
