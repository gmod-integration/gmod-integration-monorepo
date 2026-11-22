import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { getServerList } from '@gmod/domain-server/serversModels.js'
import { getUserStatisticMessage } from '../../utils/messages.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'
import { getDiscordCommunityServer } from '@gmod/core/models/v3/discordServerScope.js'

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
    if (!interaction.guild) return
    const user = interaction.options.getUser('user') || interaction.user
    const server = interaction.options.getString('server')
    const steamid = interaction.options.getString('steamid')
    if (server !== 'global' && !(await getDiscordCommunityServer(server, interaction.guild.id)))
      return interaction.reply({
        content: await getTranslate('server_not_found', interaction.guild.preferredLocale),
        flags: MessageFlags.Ephemeral,
      })

    const message = await getUserStatisticMessage(user, server!, interaction.guild, steamid)
    return interaction.reply(message)
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return
    const focusedOption = interaction.options.getFocused(true)
    const choices = {
      [await getTranslate('global_stat', interaction.guild.preferredLocale)]: 'global',
    }
    const filtered = await getServerList(interaction, focusedOption, choices)
    return interaction.respond(filtered.slice(0, 25).map((choice) => ({ name: choice, value: choices[choice] })))
  },
}
