import { SlashCommandBuilder } from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import ServerLinks from '../../../database/schema/ServerLinks.js';
import { serverConfig } from '../../../config/index.js';

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
    const linkInfo = await ServerLinks.findOne({
      where: {
        id: linkID,
      },
    });

    if (!linkInfo) {
      if (interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
          content:
            (await getTranslate('the_link_to_not_set', lang, ['`' + linkID + '`'])) +
            '\n' +
            (await getTranslate('how_to_set_the_link', lang, [
              `[Edit Guild Links](${serverConfig.websiteUrl}/dashboard/guilds/${interaction.guild.id}/config/links)`,
            ])),
          ephemeral: true,
        });
      }

      return await interaction.reply({
        content: await getTranslate('the_link_to_not_set', lang, ['`' + linkID + '`']),
        ephemeral: true,
      });
    }

    const urlEncoded = encodeURIComponent(linkInfo.url);
    return await interaction.reply({
      content: await getTranslate('the_link_to', lang, [
        `[${linkInfo.alias}](${serverConfig.websiteUrl}/open?link=${urlEncoded})`,
      ]),
    });
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const choices = {};

    const guildLinks = await ServerLinks.findAll({
      where: {
        guild: interaction.guild.id,
      },
    });

    guildLinks.forEach((link) => {
      if (!link.alias) return;
      if (choices[link.id]) return;
      if (!link.active) return;
      choices[link.id] = link.alias;
    });

    const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));
    return await interaction.respond(filtered.map((choice) => ({ name: choices[choice], value: choice })));
  },
};
