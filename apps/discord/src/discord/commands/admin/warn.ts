import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  InteractionContextType,
  type MessageActionRowComponentBuilder,
  SlashCommandBuilder,
} from 'discord.js'
import { getServerList } from '@gmod/domain-server/serversModels.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { ButtonVerificationWebsite } from '../../utils/buttons.js'
import { canViewWarningHistory, getWarnMessageEmbed, saveWarnListOptions } from '@gmod/domain-moderation/warnModels.js'

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('View your warnings. Administrators can also inspect another player.')
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('The game server in this Discord community')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('member').setDescription('The Discord member whose warnings you want to view').setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('steam')
        .setDescription('The SteamID64 of the player whose warnings you want to view')
        .setRequired(false),
    )
    .setContexts([InteractionContextType.Guild]),
  category: 'admin',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return

    const lang = interaction.guild.preferredLocale
    const serverID = interaction.options.getString('server')
    const member = interaction.options.getUser('member') || interaction.user
    let steamID64 = interaction.options.getString('steam')

    const server = serverID ? await getServerFromID(serverID) : null
    if (!server || server.getGuildID() !== interaction.guild.id) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      })
    }

    if (!steamID64) {
      const dbUser = await getUserFromDiscordID(member.id)
      if (!dbUser || !dbUser.getSteamID64()) {
        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          await ButtonVerificationWebsite(lang),
        )
        return interaction.reply({
          content: (await getTranslate('user_not_verified', lang, [`<@${member.id}>`, '/verify'])) + '\n_ _',
          ephemeral: true,
          components: [row],
        })
      } else {
        steamID64 = dbUser.getSteamID64()
      }
    }

    if (!(await canViewWarningHistory(interaction, steamID64!)))
      return interaction.reply({
        content: await getTranslate('missing_permission', lang, ['Administrator']),
        ephemeral: true,
      })

    const { embed, component, options } = await getWarnMessageEmbed(server, steamID64!, lang)
    const reply = await interaction.reply({
      embeds: [embed],
      components: [component],
      fetchReply: true,
      ephemeral: true,
    })
    await saveWarnListOptions(reply.id, server.getID(), steamID64!, options)
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true)
    const choices: { [key: string]: string } = {}
    const filtered = await getServerList(interaction, focusedOption, choices)
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })))
  },
}
