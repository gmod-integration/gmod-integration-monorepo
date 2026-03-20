import { gmLog } from '@gmod/core/utils/logger.js'
import { updateGuildStat } from '@gmod/domain-guild/discordModels.js'
import { type Guild } from 'discord.js'
import { setCachedGuildPreferredLocale } from '@gmod/core/utils/guildLocaleCache.js'
import { deleteStoredAvatar, replaceStoredAvatar } from '@gmod/infra-minio'

export default {
  name: 'guildUpdate',
  async execute(oldGuild: Guild, newGuild: Guild) {
    const iconChanged = oldGuild.icon !== newGuild.icon
    const nameChanged = oldGuild.name !== newGuild.name
    const localeChanged = oldGuild.preferredLocale !== newGuild.preferredLocale
    if (!iconChanged && !nameChanged && !localeChanged) return

    if (iconChanged) {
      gmLog('event', `Guild icon changed for ${newGuild.id}`)
      if (newGuild.icon) {
        await replaceStoredAvatar('guild', newGuild.id, newGuild.iconURL({ extension: 'png', size: 256 })).catch(() => null)
      } else {
        await deleteStoredAvatar('guild', newGuild.id)
      }
    }

    if (nameChanged) {
      gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`)
    }

    if (localeChanged) {
      gmLog('event', `Guild locale changed from ${oldGuild.preferredLocale} to ${newGuild.preferredLocale}`)
    }

    if (nameChanged || localeChanged) {
      await setCachedGuildPreferredLocale(newGuild.id, newGuild.preferredLocale)
      await updateGuildStat(newGuild)
    }
  },
}
