import { gmLog } from '@gmod/core/utils/logger.js'
import { updateGuildStat } from '@gmod/domain-guild/discordModels.js'
import { type Guild } from 'discord.js'
import { setCachedGuildPreferredLocale } from '@gmod/core/utils/guildLocaleCache.js'

export default {
  name: 'guildUpdate',
  async execute(oldGuild: Guild, newGuild: Guild) {
    const nameChanged = oldGuild.name !== newGuild.name
    const localeChanged = oldGuild.preferredLocale !== newGuild.preferredLocale
    if (!nameChanged && !localeChanged) return

    if (nameChanged) {
      gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`)
    }

    if (localeChanged) {
      gmLog('event', `Guild locale changed from ${oldGuild.preferredLocale} to ${newGuild.preferredLocale}`)
    }

    await setCachedGuildPreferredLocale(newGuild.id, newGuild.preferredLocale)
    await updateGuildStat(newGuild)
  },
}
