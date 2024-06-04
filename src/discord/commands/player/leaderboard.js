import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import {
  getLeaderboardButtons,
  getLeaderboardMessageEmbed,
  getServerLeaderboardCategories,
  saveLeaderboardOptions,
} from '../../../models/v3/leaderboardModels.js';
import { getServersFromDiscordGuildID } from '../../../classes/v3/Server.js';
import { getTranslate } from '../../../utils/localizations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Get an Server leaderboard for specific category')
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    )
    // .addUserOption(option =>
    //     option
    //         .setName('user')
    //         .setDescription('The user\'s stat you want to see')
    //         .setRequired(false)
    // )
    // .addStringOption(option =>
    //     option
    //         .setName('steam')
    //         .setDescription('The steamID64 of the user\'s stat you want to see')
    //         .setRequired(false)
    // )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('The category you want to see')
        .setRequired(false)
        .setAutocomplete(true),
    ),
  category: 'player',
  async execute(interaction) {
    const lang = interaction.guild.preferredLocale;
    const server = interaction.options.getString('server');
    const category = interaction.options.getString('category') || 'total_time';
    // const user = interaction.options.getUser('user'); // TODO
    // const steamID64 = interaction.options.getString('steam'); // TODO

    getLeaderboardMessageEmbed(server, category, lang).then(({ embed, options }) => {
      interaction
        .reply({
          embeds: [embed],
          components: [getLeaderboardButtons(options.page === 1, options.page === options.totalPages)],
          fetchReply: true,
        })
        .then((embedMessage) => {
          saveLeaderboardOptions(embedMessage.id, options);
        });
    });
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const focusedName = focusedOption.name;
    const lang = interaction.guild.preferredLocale;
    let choices = {};

    if (focusedName === 'server') {
      // Add the global option TODO
      // choices[getTranslate('global_stat', lang)] = 'global';

      getServersFromDiscordGuildID(interaction.guild.id).then((servers) => {
        // Add all servers to the choices
        servers.forEach((server) => {
          choices[server.name] = server.id;
        });

        // Filter the choices based on the focused option
        const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));

        // Respond with the filtered choices
        interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
      });
    } else if (focusedName === 'category') {
      const serverSelected = interaction.options.getString('server');

      const categories = await getServerLeaderboardCategories(serverSelected);
      // Add all categories to the choices
      categories.forEach((category) => {
        choices[category] = category;
      });

      // Filter the choices based on the focused option
      const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));

      // Respond with the translated filtered choices
      const translated = await Promise.all(
        filtered.map(async (choice) => ({
          name: await getTranslate(choice, lang),
          value: choices[choice],
        })),
      );

      interaction.respond(translated);
    }
  },
};
