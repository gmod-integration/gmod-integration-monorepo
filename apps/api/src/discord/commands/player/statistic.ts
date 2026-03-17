import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { getServerList } from '@gmod/domain-server/serversModels.js';
import { getUserStatisticMessage } from '../../utils/messages.js';
import { getTranslate } from '../../../utils/localizations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('statistic')
    .setDescription("Show your stats or another user's stats for a specific server.")
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription("The server's stat you want to see")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's stat you want to see").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('steamid').setDescription("The steam id of the user's stat you want to see").setRequired(false),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const server = interaction.options.getString('server');
    const steamid = interaction.options.getString('steamid');

    const message = await getUserStatisticMessage(user, server!, interaction.guild!, steamid);
    return interaction.reply(message);
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return;
    const focusedOption = interaction.options.getFocused(true);
    let choices = {
      [await getTranslate('global_stat', interaction.guild.preferredLocale)]: 'global',
    };
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
