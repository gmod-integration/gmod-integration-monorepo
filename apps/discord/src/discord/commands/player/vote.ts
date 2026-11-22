import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'
import { getServerList } from '@gmod/domain-server/serversModels.js'
import { secToTime } from '../../utils/index.js'
import { getDiscordCommunityServer } from '@gmod/core/models/v3/discordServerScope.js'
import { registerCommunityServerVote } from '@gmod/core/models/v3/serverVoteModels.js'

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Upvote the visibility of a server in the server list.')
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return

    const server = interaction.options.getString('server')
    if (!server) return

    const user = interaction.user
    const lang = interaction.guild.preferredLocale

    const serverData = await getDiscordCommunityServer(server, interaction.guild.id)
    if (!serverData)
      return interaction.reply({ content: await getTranslate('server_not_found', lang), ephemeral: true })
    const result = await registerCommunityServerVote(server, interaction.guild.id, user.id)
    if (result.status === 'not_found')
      return interaction.reply({ content: await getTranslate('server_not_found', lang), ephemeral: true })
    if (result.status === 'cooldown')
      return interaction.reply({
        content: await getTranslate('vote_cooldown', lang, [secToTime(result.retryAfterSeconds)]),
        ephemeral: true,
      })

    const webhooks = await serverData.getVoteChannel()
    if (webhooks) {
      const channel = interaction.guild.channels.cache.get(webhooks.channelID)
      if (webhooks && channel && channel.isTextBased()) {
        try {
          await channel.send({
            content: await getTranslate('vote_webhook', lang, [user.username, serverData.name]),
            allowedMentions: { parse: [] },
          })
        } catch {
          console.warn('Vote saved; Discord notification unavailable.')
        }
      }
    }

    return interaction.reply({
      content: await getTranslate('vote_success', lang, [serverData.name]),
      ephemeral: true,
    })
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return
    const focusedOption = interaction.options.getFocused(true)
    const choices: { [key: string]: string } = {}
    const filtered = await getServerList(interaction, focusedOption, choices)
    return interaction.respond(filtered.slice(0, 25).map((choice) => ({ name: choice, value: choices[choice] })))
  },
}
