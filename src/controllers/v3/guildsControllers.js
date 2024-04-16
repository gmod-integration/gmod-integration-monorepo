import { getConnectionPromise } from '../../database/connection.js';
import { getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { isGuildPremium } from '../../classes/v3/Guild.js';
import { getTranslate } from '../../utils/localizations.js';
import { ActionRowBuilder } from 'discord.js';
import { ButtonPremium } from '../../discord/utils/buttons.js';
import { wsSendToServer } from '../../websockets/index.js';

export async function sendMessageToGmod(message) {
  if (message.author.bot || !message.guild) return;
  const lang = message.guild.preferredLocale;

  const connection = await getConnectionPromise();
  const [rows] = await connection.query('SELECT * FROM gm_sync_chat WHERE guild = ? AND channel = ?', [
    message.guild.id,
    message.channel.id,
  ]);

  if (!rows || rows.length === 0) return;

  let serversInfo = await getServersFromDiscordGuildID(message.guild.id);

  for (const row of rows) {
    const server = serversInfo.find((server) => server.getID() === row.server);
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
        content: getTranslate('premium_required', lang),
        ephemeral: true,
        components: [new ActionRowBuilder().addComponents(ButtonPremium(lang))],
      });
    }

    wsSendToServer(row.server, {
      method: 'wsPlayerSay',
      name: message.author.username,
      content: message.content,
      avatar: message.author.displayAvatarURL({ format: 'png', dynamic: true }),
    });
  }
}
