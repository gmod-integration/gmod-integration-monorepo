import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'
import { getDiscordCommunityServer } from '@gmod/core/models/v3/discordServerScope.js'
import { getPlayerRewards } from '@gmod/core/models/v6/rewards.js'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { getServerList } from '@gmod/domain-server/serversModels.js'

const plain = (value: string) => value.replace(/[\\`*_~|>]/g, '\\$&')

export default {
  data: new SlashCommandBuilder()
    .setName('rewards')
    .setDescription('View your rewards, progress and delivery history for a game server.')
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option.setName('server').setDescription('Game server').setRequired(true).setAutocomplete(true),
    )
    .addIntegerOption((option) => option.setName('page').setDescription('Page of rewards').setMinValue(1)),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return
    const serverID = interaction.options.getString('server')
    if (!serverID) return
    const language = interaction.guild.preferredLocale
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      const server = await getDiscordCommunityServer(serverID, interaction.guild.id)
      if (!server) return interaction.editReply({ content: await getTranslate('server_not_found', language) })
      const user = await getUserFromDiscordID(interaction.user.id)
      const steamID64 = user?.getSteamID64()
      if (!steamID64) return interaction.editReply({ content: await getTranslate('rewards_link_required', language) })
      const data = await getPlayerRewards(serverID, steamID64)
      if (!data.rewards.length) return interaction.editReply({ content: await getTranslate('rewards_empty', language) })
      const pages = Math.max(1, Math.ceil(data.rewards.length / 5))
      const page = Math.min(interaction.options.getInteger('page') ?? 1, pages)
      const embed = new EmbedBuilder()
        .setTitle(await getTranslate('rewards_title', language, [plain(server.name).slice(0, 180)]))
        .setDescription(await getTranslate('rewards_automatic', language))
        .setFooter({ text: await getTranslate('rewards_page', language, [String(page), String(pages)]) })
      for (const item of data.rewards.slice((page - 1) * 5, page * 5)) {
        const latest = data.history.find((grant) => grant.ruleID === item.rule.id)
        const status =
          latest?.status ??
          (item.rule.trigger.type === 'manual' ? 'manual' : item.simulation.eligible ? 'eligible' : 'locked')
        const parts = [await getTranslate(`rewards_status_${status}`, language)]
        if (item.rule.description) parts.push(plain(item.rule.description))
        if (item.rule.trigger.type === 'playtime')
          parts.push(
            await getTranslate('rewards_progress', language, [
              (item.simulation.playedSeconds / 3600).toLocaleString(language, { maximumFractionDigits: 1 }),
              (item.rule.trigger.seconds / 3600).toLocaleString(language, { maximumFractionDigits: 1 }),
            ]),
          )
        for (const action of item.rule.actions) {
          if (action.type === 'lua') {
            parts.push(await getTranslate('rewards_action_lua', language))
            continue
          }
          parts.push(
            await getTranslate(`rewards_action_${action.type}`, language, [
              action.type === 'discord_role' ? action.roleID : action.amount.toLocaleString(language),
            ]),
          )
        }
        embed.addFields({ name: plain(item.rule.name), value: parts.join('\n').slice(0, 1024) })
      }
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } })
    } catch {
      return interaction.editReply({ content: await getTranslate('rewards_unavailable', language) })
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return
    const choices: Record<string, string> = {}
    const filtered = await getServerList(interaction, interaction.options.getFocused(true), choices)
    return interaction.respond(filtered.slice(0, 25).map((name) => ({ name, value: choices[name] })))
  },
}
