import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  InteractionContextType,
  type MessageActionRowComponentBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { getServerList } from '@gmod/domain-server/serversModels.js';
import { getUserFromDiscordID } from '@gmod/domain-user/User.js';
import { ButtonVerificationWebsite } from '@/discord/utils/buttons.js';
import { getServerFromID } from '@gmod/domain-server/Server.js';
import { isGuildPremium, replyNeedPremium } from '@gmod/domain-guild/Guild.js';
import { type WSSendToServerData, wsSendToServerQueue } from '@gmod/infra-websocket/queues.js';
import { getTranslate } from '@gmod/core/utils/localizations.js';

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
    .setContexts([InteractionContextType.Guild])
    .setDefaultMemberPermissions(0),
  category: 'admin',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const lang = interaction.guild.preferredLocale;
    const serverID = interaction.options.getString('server');
    if (!serverID) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      });
    }

    const server = await getServerFromID(serverID);
    if (!server) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      });
    }

    const user = await getUserFromDiscordID(interaction.user.id);
    if (!user || !user.steamID64) {
      return interaction.reply({
        content: await getTranslate('rcon_steam_link', lang),
        ephemeral: true,
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(await ButtonVerificationWebsite(lang)),
        ],
      });
    }

    const player = await server.getServerPlayer(user.steamID64);
    if (!player || player.rank !== 'superadmin') {
      return interaction.reply({
        content: await getTranslate('rcon_superadmin', lang),
        ephemeral: true,
      });
    }

    if (!(await isGuildPremium(interaction.guild.id))) {
      return replyNeedPremium(interaction);
    }

    await wsSendToServerQueue.add('wsSendToServer', {
      id: server.getID(),
      data: {
        method: 'wsRcon',
        steamID: user.getSteamID64(),
        command: interaction.options.getString('command'),
      },
    } as WSSendToServerData);

    return interaction.reply({
      content: await getTranslate(wsSend ? 'rcon_command_success' : 'rcon_command_error', lang),
      ephemeral: true,
    });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices: { [key: string]: string } = {};
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
