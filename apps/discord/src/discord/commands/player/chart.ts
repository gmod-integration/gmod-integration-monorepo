import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { getServerFromID, getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { playerConnectionChart, playerTeamTimeChat } from '../../utils/index.js'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'
import { ConfigDiscord } from '@gmod/config'

export default {
  data: new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Get an Server leaderboard for specific category')
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('stat').setDescription('The stat you want to see').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('duration').setDescription('The duration of the chart').setRequired(false).setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's stat you want to see").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('steam').setDescription("The steamID64 of the user's stat you want to see").setRequired(false),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return

    const lang = interaction.guild.preferredLocale

    const serverID = interaction.options.getString('server')
    if (!serverID) return interaction.reply(await getTranslate('server_not_found', lang))

    const server = await getServerFromID(serverID)
    if (!server) return interaction.reply(await getTranslate('server_not_found', lang))

    let steamID64 = interaction.options.getString('steam') || null
    const user = interaction.options.getUser('user') || interaction.user

    const stat = interaction.options.getString('stat')
    if (!stat) return interaction.reply(await getTranslate('stat_not_found', lang))

    let duration = interaction.options.getString('duration') || '7'
    if (!['7', '30', '90', 'max'].includes(duration))
      return interaction.reply(await getTranslate('duration_not_found', lang))
    if (duration === 'max') duration = '0'
    const durationNumber = parseInt(duration)

    if (!steamID64) {
      const dbUser = await getUserFromDiscordID(user.id)
      if (!dbUser || !dbUser.getSteamID64()) {
        return interaction.reply({
          content: await getTranslate('user_not_verified', lang, [`<@${user.id}>`, '/verify']),
          flags: MessageFlags.Ephemeral,
        })
      }
      steamID64 = dbUser.getSteamID64()
      if (!steamID64) {
        return interaction.reply({
          content: 'This user has no steamID64',
          flags: MessageFlags.Ephemeral,
        })
      }
    }

    try {
      const embed = new EmbedBuilder()
        .setImage('attachment://chart.png')
        .setColor(ConfigDiscord.embedColor)
        .setFooter({
          text: `${server.getName()} - ${steamID64} - ${await getTranslate(stat, lang)} - ${(durationNumber !== 0 ? durationNumber : 'max') + ' ' + (durationNumber !== 0 ? await getTranslate('days', lang) : '')}`,
        })
        .setTimestamp()
      await interaction.reply({
        embeds: [embed],
        files: [
          {
            attachment:
              (stat == 'team' && (await playerTeamTimeChat(server, steamID64, lang, durationNumber))) ||
              (await playerConnectionChart(server, steamID64, lang, stat, durationNumber)),
            name: 'chart.png',
          },
        ],
      })
    } catch (error) {
      console.error(error)
      await interaction.reply('An error occurred while generating the chart')
    }
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
        interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })))
      })
    } else if (focusedName === 'stat') {
      /*
      return those choices
          time: 'Time',
          kills: 'Kills',
          deaths: 'Deaths',
          kd: 'K/D',
          connections: 'Connections',
       */
      const stats = ['time', 'team', 'kills', 'deaths', 'kd', 'connections']
      // Add all categories to the choices
      for (const stat of stats) {
        choices[await getTranslate(stat, lang)] = stat
      }

      // Filter the choices based on the focused option
      const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value))
      await interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })))
    } else if (focusedName === 'duration') {
      // Add all durations to the choices 7 = 7 days, 30 = 30 days, 90 = 90 days, max = max days
      const durations = ['7', '30', '90']
      if (interaction.options.getString('stat') === 'team') {
        durations.push('max')
      }
      // add days to the choices of translate max
      for (const duration of durations) {
        if (duration === 'max') {
          choices[await getTranslate('max', lang)] = duration
        } else {
          choices[`${duration} ${await getTranslate('days', lang)}`] = duration
        }
      }

      // Filter the choices based on the focused option
      const filtered = Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value))
      await interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })))
    }
  },
}
