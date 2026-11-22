import type { Guild } from '@gmod/domain-guild/Guild.js'
import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'

type RemovalGuild = Pick<Guild, 'id' | 'mainBotOnGuild' | 'reloadBotInstance'>

/** Removal retains the purchase and requires a working main-bot fallback before clearing credentials. */
export async function processDeleteGuildBotInstance(guild: RemovalGuild) {
  let hasMainBot: boolean
  try {
    hasMainBot = await guild.mainBotOnGuild()
  } catch {
    return { status: 503, body: { error: 'main_bot_unavailable' } }
  }
  if (!hasMainBot) return { status: 409, body: { error: 'main_bot_required' } }

  await prisma.$transaction(async (tx) => {
    // Scope the write itself to this guild, including revoked purchases that still hold a credential.
    await tx.gm_gmodstore_purchases.updateMany({ where: { guild: guild.id }, data: { token: '' } })
    await tx.gm_guild_settings.deleteMany({ where: { guildID: guild.id, setting: 'bot_status' } })
  })

  // Retry both steps even when the credential is already empty: a previous request may have lost its reply.
  const [cache, runtime] = await Promise.allSettled([
    redis.del(`server:${guild.id}:setting:bot_status`),
    guild.reloadBotInstance(),
  ])
  try {
    // This final read is the success observation point. A concurrent setup may have replaced the
    // removed credential while the worker was reloading; preserve that newer configuration.
    const reconfigured = await prisma.gm_gmodstore_purchases.findFirst({
      where: { guild: guild.id, token: { not: '' } },
      select: { steamID64: true },
    })
    if (reconfigured) {
      return { status: 409, body: { error: 'custom_bot_reconfigured', tokenConfigured: true } }
    }
  } catch {
    return { status: 503, body: { error: 'custom_bot_state_unavailable' } }
  }
  if (cache.status !== 'fulfilled' || runtime.status !== 'fulfilled' || runtime.value !== true) {
    return { status: 503, body: { error: 'custom_bot_disconnect_pending', tokenConfigured: false } }
  }

  return { status: 200, body: { removed: true, tokenConfigured: false } }
}
