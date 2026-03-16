import { getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { isGuildPremium } from '../../classes/v3/Guild.js';
import { getTranslate } from '../../utils/localizations.js';
import { ActionRowBuilder, Message, MessageActionRowComponentBuilder } from 'discord.js';
import { ButtonPremium } from '../../discord/utils/buttons.js';
import { WSSendToServerData, wsSendToServerQueue } from '../../websockets/index.js';
import { getGuildClient } from '../../discord/index.js';
import prisma from '@gmod/infra-prisma/index.js';

export async function sendMessageToGmod(message: Message) {
  if (message.author.bot || !message.guild) return;
  const lang = message.guild.preferredLocale;

  const guildBotInstance = await getGuildClient(message.guild.id, false);
  if (guildBotInstance.user!.id !== message.guild.client.user.id) {
    return;
  }

  const channels = await prisma.gm_sync_chat.findMany({
    where: {
      guild: message.guild.id,
      channel: message.channel.id,
    },
  });

  if (!channels || channels.length === 0) {
    return;
  }

  let serversInfo = await getServersFromDiscordGuildID(message.guild.id);

  for (const server of serversInfo) {
    const syncChatChannel = await server.getSyncChatChannel();
    if (!syncChatChannel) continue;

    const syncChatDirection = await server.getSetting('syncChatDirection');
    if (syncChatDirection === 'gmodToDiscord') continue;

    if (!(await isGuildPremium(message.guild.id))) {
      return message.reply({
        content: await getTranslate('premium_required', lang),
        components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(await ButtonPremium(lang))],
      });
    }

    await wsSendToServerQueue.add('wsSendToServer', {
      id: server.getID(),
      data: {
        method: 'wsPlayerSay',
        name: message.author.username,
        content: message.content,
        avatar: message.author.displayAvatarURL({ extension: 'png' }),
      },
    } as WSSendToServerData);
  }
}
