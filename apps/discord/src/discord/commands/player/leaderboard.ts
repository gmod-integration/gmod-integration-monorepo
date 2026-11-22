import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import {
  getLeaderboardButtons,
  getLeaderboardMessageEmbed,
  getServerLeaderboardCategories,
  saveLeaderboardOptions,
} from '@gmod/core/models/v3/leaderboardModels.js'
import { getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Get an Server leaderboard for specific category')
    .setContexts([InteractionContextType.Guild])
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
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return
    const lang = interaction.guild.preferredLocale
    const server = interaction.options.getString('server')
    const category = interaction.options.getString('category') || 'total_time'
    if (!server)
      return interaction.reply({ content: await getTranslate('server_not_found', lang), flags: MessageFlags.Ephemeral })
    // const user = interaction.options.getUser('user'); // TODO
    // const steamID64 = interaction.options.getString('steam'); // TODO

    const leaderboardData = await getLeaderboardMessageEmbed(server, category, lang, interaction.guild.id)
    if (!leaderboardData) {
      return interaction.reply({ content: await getTranslate('server_not_found', lang), flags: MessageFlags.Ephemeral })
    }

    const { embed, options } = leaderboardData
    const embedMessage = await interaction.reply({
      embeds: [embed],
      components: [getLeaderboardButtons(options.page === 1, options.totalPages === options.page)],
      fetchReply: true,
    })
    await saveLeaderboardOptions(embedMessage.id, options)
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return
    const focusedOption = interaction.options.getFocused(true)
    const focusedName = focusedOption.name
    const lang = interaction.guild.preferredLocale
    const choices: { [key: string]: string } = {}

    if (focusedName === 'server') {
      // Add the global option TODO
      // choices[getTranslate('global_stat', lang)] = 'global';

      getServersFromDiscordGuildID(interaction.guild.id).then((servers) => {
        // Add all servers to the choices
        servers.forEach((server) => {
          choices[server.name] = server.id
        })

        // Filter the choices based on the focused option
        const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value))

        // Respond with the filtered choices
        interaction.respond(filtered.slice(0, 25).map((choice) => ({ name: choice, value: choices[choice] })))
      })
    } else if (focusedName === 'category') {
      const serverSelected = interaction.options.getString('server')
      if (!serverSelected) return interaction.respond([])

      const categories = await getServerLeaderboardCategories(serverSelected, interaction.guild.id)
      // Add all categories to the choices
      categories.forEach((category) => {
        choices[category] = category
      })

      // Filter the choices based on the focused option
      const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value))

      // Respond with the translated filtered choices
      const translated = await Promise.all(
        filtered.slice(0, 25).map(async (choice) => ({
          name: await getTranslate(choice, lang),
          value: choices[choice],
        })),
      )

      await interaction.respond(translated)
    }
  },
}
