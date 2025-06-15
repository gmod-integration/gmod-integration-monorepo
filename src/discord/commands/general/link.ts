import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  InteractionContextType,
  PermissionsBitField,
  SlashCommandBuilder,
} from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { ConfigServer } from '../../../classes/config/Config.js';
import index from '../../../services/prisma/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Select a link to get.')
    .addStringOption((option) =>
      option.setName('link').setDescription('The link to get.').setRequired(true).setAutocomplete(true),
    )
    .setContexts([InteractionContextType.Guild]),
  category: 'general',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) return;

    const lang = interaction.guild.preferredLocale;
    const linkID = interaction.options.getString('link');
    if (!linkID) return;

    const linkInfo = await index.gm_server_links.findFirst({
      where: {
        id: Number(linkID),
      },
    });

    const member = interaction.member as GuildMember;
    if (!linkInfo) {
      if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return await interaction.reply({
          content:
            (await getTranslate('the_link_to_not_set', lang, ['`' + linkID + '`'])) +
            '\n' +
            (await getTranslate('how_to_set_the_link', lang, [
              `[Edit Guild Links](${ConfigServer.websiteUrl}/dashboard/guilds/${interaction.guild.id}/config/links)`,
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
        `[${linkInfo.alias}](<${ConfigServer.websiteUrl}/open?link=${urlEncoded}>)`,
      ]),
    });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return;
    const focusedOption = interaction.options.getFocused(true);
    const choices: Record<string, string> = {};

    const guildLinks = await index.gm_server_links.findMany({
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
