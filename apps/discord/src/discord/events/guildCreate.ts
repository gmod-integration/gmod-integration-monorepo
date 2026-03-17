import { gmLog } from '@gmod/core/utils/logger.js'
import { updateGuildStat } from '@gmod/domain-guild/discordModels.js'
import { type Guild } from 'discord.js'
import { setCachedGuildPreferredLocale } from '@gmod/core/utils/guildLocaleCache.js'

export default {
  name: 'guildCreate',
  async execute(guild: Guild) {
    gmLog('event', `Bot joined guild: ${guild.name}`)
    await setCachedGuildPreferredLocale(guild.id, guild.preferredLocale)
    await updateGuildStat(guild)
  },
}
