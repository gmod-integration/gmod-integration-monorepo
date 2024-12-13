import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { getServerList } from '../../../models/v3/serversModels.js';
import { getServerFromID } from '../../../classes/v3/Server.js';
import { getServerChart } from '../../utils/index.js';

export default {
  dev: true,
  data: new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Get an Server leaderboard for specific category')
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's stat you want to see").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('steam').setDescription("The steamID64 of the user's stat you want to see").setRequired(false),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const lang = interaction.guild.preferredLocale;
    const serverID = interaction.options.getString('server');
    if (!serverID) return interaction.reply('No server provided');
    const server = await getServerFromID(serverID);
    if (!server) return interaction.reply('Server not found');

    const user = interaction.options.getUser('user');
    const steamID64 = interaction.options.getString('steam');

    try {
      const embed = new EmbedBuilder()
        .setImage('attachment://chart.png')
        .setColor('#2b2d31')
        .setFooter({
          text: 'Chart',
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [embed],
        files: [
          {
            attachment: await getServerChart(server),
            name: 'chart.png',
          },
        ],
      });
    } catch (error) {
      console.error(error);
      await interaction.reply('An error occurred while generating the chart');
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return;
    const focusedOption = interaction.options.getFocused(true);
    let choices: Record<string, string> = {
      // [await getTranslate('global_stat', interaction.guild.preferredLocale)]: 'global',
    };
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
