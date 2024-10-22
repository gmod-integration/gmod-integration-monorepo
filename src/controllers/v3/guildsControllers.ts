import { getServersFromDiscordGuildID, Server } from '../../classes/v3/Server.js';
import { isGuildPremium } from '../../classes/v3/Guild.js';
import { getTranslate } from '../../utils/localizations';
import { ActionRowBuilder, Message, MessageActionRowComponentBuilder } from 'discord.js';
import { ButtonPremium } from '../../discord/utils/buttons.js';
import { wsSendToServer } from '../../websockets';
import { getGuildClient } from '../../discord';
import prisma from '../../prisma';

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

  if (!channels) {
    return;
  }

  let serversInfo = await getServersFromDiscordGuildID(message.guild.id);

  for (const row of channels) {
    const server = serversInfo.find((server: Server) => server.getID() === row.server);
    if (!server || !server.isValid()) {
      console.error(`Server ${row.server} not found`);
      continue;
    }

    const syncChatChannel = await server.getSyncChatChannel();
    if (!syncChatChannel) {
      console.error(`Server ${row.server} not syncing chat because syncChatChannel is not set`);
      continue;
    }

    const syncChatDirection = await server.getSetting('syncChatDirection');
    if (syncChatDirection === 'gmodToDiscord') {
      console.log(`Server ${row.server} syncing chat from Gmod to Discord`);
      continue;
    }

    if (!(await isGuildPremium(message.guild.id))) {
      return message.reply({
        content: await getTranslate('premium_required', lang),
        components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(await ButtonPremium(lang))],
      });
    }

    wsSendToServer(row.server, {
      method: 'wsPlayerSay',
      name: message.author.username,
      content: message.content,
      avatar: message.author.displayAvatarURL({ extension: 'png' }),
    });
  }
}
