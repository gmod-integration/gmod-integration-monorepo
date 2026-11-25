import { gmLog } from '@gmod/shared/logger.js'
import { ConfigDiscord } from '@gmod/config'
import { getGuildClient, getMainClient, killGuildClient } from '../index.js'
import { type Guild } from 'discord.js'
import prisma from '@gmod/infra-prisma'
import { deleteCachedGuildPreferredLocale } from '@gmod/core/utils/guildLocaleCache.js'
import { deleteStoredAvatar } from '@gmod/infra-minio'
import { invalidateDiscordGuildPermissions } from '@gmod/domain-user/guildPermissions.js'

export default {
  name: 'guildDelete',
  async execute(guild: Guild) {
    await invalidateDiscordGuildPermissions({ guildID: guild.id })
    gmLog('event', `Bot left guild: ${guild.name}`)

    const guildBotInstance = await getGuildClient(guild.id, false)
    if (!guildBotInstance.user) return
    if (guildBotInstance !== guild.client) {
      return
    }

    if (guild.client.user.id !== ConfigDiscord.clientID) {
      await killGuildClient(guild.id)
      try {
        const mainClient = await getMainClient()
        // The departing custom client's credential cannot establish the main bot's membership.
        // Force an independent lookup instead of trusting an old guild/member cache entry.
        await mainClient.guilds.fetch({ guild: guild.id, force: true })
        return
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 10004) {
          gmLog('warning', `Main bot presence is unconfirmed for guild ${guild.id}; retaining community data`)
          return
        }
      }
    }

    await deleteCachedGuildPreferredLocale(guild.id)
    await deleteStoredAvatar('guild', guild.id)

    const oldGuild = await prisma.gm_guild.findFirst({
      where: {
        guild: guild.id,
      },
    })

    if (oldGuild) {
      await prisma.gm_guild.delete({
        where: {
          guild: guild.id,
        },
      })
    }

    const purchase = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: guild.id,
      },
    })

    if (purchase) {
      await prisma.gm_gmodstore_purchases.update({
        where: {
          steamID64: purchase.steamID64,
        },
        data: {
          guild: '',
          token: '',
        },
      })
    }
  },
}
