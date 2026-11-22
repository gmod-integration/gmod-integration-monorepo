import { hasCapability, resolveGuildAccess } from '@gmod/domain-access/index.js'
import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  InteractionContextType,
  type MessageActionRowComponentBuilder,
  SlashCommandBuilder,
} from 'discord.js'
import { getServerList } from '@gmod/domain-server/serversModels.js'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { ButtonVerificationWebsite } from '../../utils/buttons.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { replyNeedPremium } from '@gmod/domain-guild/Guild.js'
import { enqueueAddonRconAndWait } from '@gmod/infra-websocket/addonCommands.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'

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
    if (!interaction.guild) return

    const lang = interaction.guild.preferredLocale
    const serverID = interaction.options.getString('server')
    if (!serverID) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      })
    }

    const server = await getServerFromID(serverID)
    if (!server || server.getGuildID() !== interaction.guild.id) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      })
    }

    const user = await getUserFromDiscordID(interaction.user.id)
    if (!user || !user.steamID64) {
      return interaction.reply({
        content: await getTranslate('rcon_steam_link', lang),
        ephemeral: true,
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(await ButtonVerificationWebsite(lang)),
        ],
      })
    }

    const access = await resolveGuildAccess(server.getGuildID())
    if (!hasCapability(access, 'console.rcon')) {
      if (access.state === 'unknown')
        return interaction.reply({
          content: await getTranslate('access_verification_unavailable', lang),
          ephemeral: true,
        })
      return replyNeedPremium(interaction)
    }

    // The addon checks its current configured administrator ranks immediately before execution.
    await interaction.deferReply({ ephemeral: true })
    const executed = await enqueueAddonRconAndWait(
      {
        serverID: server.getID(),
        steamID: user.steamID64,
        command: interaction.options.getString('command', true),
      },
      5000,
    ).catch((error) => {
      console.error('Failed to confirm addon RCON execution:', error)
      return false
    })

    return interaction.editReply({
      content: await getTranslate(executed ? 'rcon_command_success' : 'rcon_command_error', lang),
    })
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true)
    const choices: { [key: string]: string } = {}
    const filtered = await getServerList(interaction, focusedOption, choices)
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })))
  },
}
