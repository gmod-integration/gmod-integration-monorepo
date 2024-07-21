import { ActionRowBuilder, SlashCommandBuilder } from 'discord.js';
import { getServerList } from '../../../models/v3/serversModels.js';
import { getUserFromDiscordID } from '../../../classes/v3/User.js';
import { ButtonVerificationWebsite } from '../../utils/buttons.js';
import { getServerFromID } from '../../../classes/v3/Server.js';
import { isGuildPremium, replyNeedPremium } from '../../../classes/v3/Guild.js';
import { wsSendToServer } from '../../../websockets/index.js';
import { getTranslate } from '../../../utils/localizations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rcon')
    .setDescription('Execute a command on the server console.')
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('The server you want to execute the command on')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('command').setDescription('The command you want to execute').setRequired(true),
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(0),
  category: 'admin',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;
    const serverID = interaction.options.getString('server');

    const server = await getServerFromID(serverID);
    if (!server) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      });
    }

    const user = await getUserFromDiscordID(interaction.user.id);
    if (!user) {
      return interaction.reply({
        content: await getTranslate('rcon_steam_link', lang),
        ephemeral: true,
        components: [new ActionRowBuilder().addComponents(await ButtonVerificationWebsite(lang))],
      });
    }

    const player = await server.getServerPlayer(user.getSteamID64());
    if (!player || !player.isSuperAdmin()) {
      return interaction.reply({
        content: await getTranslate('rcon_superadmin', lang),
        ephemeral: true,
      });
    }

    if ((await isGuildPremium(interaction.guild.id)) === false) {
      return replyNeedPremium(interaction);
    }

    const wsSend = wsSendToServer(serverID, {
      method: 'wsRcon',
      steamID: user.getSteamID64(),
      command: interaction.options.getString('command'),
    });

    return interaction.reply({
      content: await getTranslate(wsSend ? 'rcon_command_success' : 'rcon_command_error', lang),
      ephemeral: true,
    });
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices = {};
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
