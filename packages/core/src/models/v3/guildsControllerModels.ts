import { getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { isGuildPremium } from '@gmod/domain-guild/Guild.js'
import { getTranslate } from '../../utils/localizations.js'
import { ActionRowBuilder, type Message, type MessageActionRowComponentBuilder } from 'discord.js'
import { ButtonPremium } from '@gmod/domain-guild/discordMessages.js'
import { type WSSendToServerData, wsSendToServerQueue } from '@gmod/infra-websocket/queues.js'
import prisma from '@gmod/infra-prisma'

export async function processDiscordMessageToGmod(message: Message) {
  if (message.author.bot || !message.guild) return
  const lang = message.guild.preferredLocale

  const channels = await prisma.gm_sync_chat.findMany({
    where: {
      guild: message.guild.id,
      channel: message.channel.id,
    },
  })

  if (!channels || channels.length === 0) {
    return
  }

  const serversInfo = await getServersFromDiscordGuildID(message.guild.id)

  for (const server of serversInfo) {
    const syncChatChannel = await server.getSyncChatChannel()
    if (!syncChatChannel) continue

    const syncChatDirection = await server.getSetting('syncChatDirection')
    if (syncChatDirection === 'gmodToDiscord') continue

    if (!(await isGuildPremium(message.guild.id))) {
      await message.reply({
        content: await getTranslate('premium_required', lang),
        components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(await ButtonPremium(lang))],
      })
      return
    }

    await wsSendToServerQueue.add('wsSendToServer', {
      id: server.getID(),
      data: {
        method: 'wsPlayerSay',
        name: message.author.username,
        content: message.content,
        avatar: message.author.displayAvatarURL({ extension: 'png' }),
      },
    } as WSSendToServerData)
  }
}
