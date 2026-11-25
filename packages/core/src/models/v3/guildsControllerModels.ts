import { getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import type { Message } from 'discord.js'
import { type WSSendToServerData, wsSendToServerQueue } from '@gmod/infra-websocket/queues.js'
import prisma from '@gmod/infra-prisma'
import { ensureAvatarStored } from '@gmod/infra-minio'

export async function processDiscordMessageToGmod(message: Message) {
  if (message.author.bot || !message.guild) return

  const channels = await prisma.gm_sync_chat.findMany({
    where: {
      guild: message.guild.id,
      channel: message.channel.id,
    },
    select: { server: true },
  })

  if (!channels || channels.length === 0) {
    return
  }

  const targetIDs = new Set(channels.map((channel) => channel.server))
  const serversInfo = await getServersFromDiscordGuildID(message.guild.id)

  for (const server of serversInfo) {
    if (!targetIDs.has(server.getID()) || server.getGuildID() !== message.guild.id) continue

    const syncChatDirection = await server.getEffectiveSetting('syncChatDirection')
    if (syncChatDirection !== 'both' && syncChatDirection !== 'discordToGmod') continue

    await wsSendToServerQueue.add('wsSendToServer', {
      id: server.getID(),
      data: {
        method: 'wsPlayerSay',
        name: message.author.username,
        content: message.content,
        avatar: await ensureAvatarStored('discord', message.author.id, message.author.displayAvatarURL()),
      },
    } as WSSendToServerData)
  }
}
