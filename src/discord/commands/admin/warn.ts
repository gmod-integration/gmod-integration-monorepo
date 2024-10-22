import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { getServerList } from '../../../models/v3/serversModels';
import { getServerFromID } from '../../../classes/v3/Server.js';
import { getTranslate } from '../../../utils/localizations';
import { getUserFromDiscordID } from '../../../classes/v3/User.js';
import { ButtonVerificationWebsite } from '../../utils/buttons';
import { getWarnMessageEmbed, saveWarnListOptions } from '../../../models/v3/warnModels.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Show the warn of the user on the server')
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('The server you want to execute the command on')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('member').setDescription('The member you want to show the warn').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('steam').setDescription('The steamID64 of the user you want to show the warn').setRequired(false),
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(0),
  category: 'admin',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const lang = interaction.guild.preferredLocale;
    const serverID = interaction.options.getString('server');
    const member = interaction.options.getUser('member') || interaction.user;
    let steamID64 = interaction.options.getString('steam');

    const server = await getServerFromID(serverID!);
    if (!server) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      });
    }

    if (!steamID64) {
      const dbUser = await getUserFromDiscordID(member.id);
      if (!dbUser || !dbUser.getSteamID64()) {
        const row = new ActionRowBuilder().addComponents(await ButtonVerificationWebsite(lang));
        return {
          content: (await getTranslate('user_not_verified', lang, [`<@${member.id}>`, '/verify'])) + '\n_ _',
          ephemeral: true,
          components: [row],
        };
      } else {
        steamID64 = dbUser.getSteamID64();
      }
    }

    const { embed, component, options } = await getWarnMessageEmbed(server, steamID64!, lang);
    interaction
      .reply({
        embeds: [embed],
        components: [component],
        fetchReply: true,
      })
      .then(async (msgReply) => {
        await saveWarnListOptions(msgReply.id, server.getID(), steamID64!, options);
      });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices: { [key: string]: string } = {};
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
