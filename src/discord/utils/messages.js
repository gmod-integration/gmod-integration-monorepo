import { getTranslate } from '../../utils/localizations.js';
import { gmLog } from '../../utils/logger.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ButtonConnect } from './buttons.js';

export async function getStatusMessage(server, data, buttons, lang) {
  gmLog('status', 'refresh server status message for ' + server.getID());

  const servOnline = !!data.hostname;
  const hostname = data.hostname ? data.hostname : await getTranslate('offline', lang);
  const map = data.map ? data.map : await getTranslate('offline', lang);
  const gameMode = data.gameMode ? data.gameMode : await getTranslate('offline', lang);
  const players = data.players ? data.players : await getTranslate('offline', lang);
  const maxPlayers = data.maxPlayers ? data.maxPlayers : await getTranslate('offline', lang);
  const uptime = data.uptime ? data.uptime : await getTranslate('offline', lang);

  const embed = {
    color: 0x2b2d31,
    title: await getTranslate('status_of', lang, [server.getName() || server.getID()]),
    fields: [
      {
        name: '💾⠀' + (await getTranslate('name', lang)),
        value: hostname,
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '📡⠀' + (await getTranslate('status', lang)),
        value: servOnline ? await getTranslate('online', lang) : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '',
        inline: true,
      },
      {
        name: '👤⠀' + (await getTranslate('players', lang)),
        value: servOnline ? players + '/' + maxPlayers : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '🗺️⠀' + (await getTranslate('map', lang)),
        value: map,
        inline: true,
      },
      {
        name: '',
        value: '',
        inline: true,
      },
      {
        name: '🛻⠀' + (await getTranslate('gamemode', lang)),
        value: gameMode,
        inline: true,
      },
    ],
    timestamp: new Date(),
  };

  let rows = [];
  let row1 = new ActionRowBuilder();
  let row2 = new ActionRowBuilder();
  let row3 = new ActionRowBuilder();
  let row4 = new ActionRowBuilder();
  let row5 = new ActionRowBuilder();

  if (servOnline) {
    row1.addComponents(await ButtonConnect(lang, data.ip, data.port));
  }

  function addButtons(button, theRow) {
    let { label, emoji, url } = button;

    if (!label || !emoji) {
      return;
    }

    label = label.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

    const theButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(`⠀${label}`)
      .setEmoji(emoji)
      .setURL(`https://gmod-integration.com/open-link?link=${url}`);

    // Ajouter le bouton à la ligne
    theRow.addComponents(theButton);
  }

  buttons.forEach((button) => {
    if (row1.components.length < 5) {
      addButtons(button, row1);
    } else if (row2.components.length < 5) {
      addButtons(button, row2);
    } else if (row3.components.length < 5) {
      addButtons(button, row3);
    } else if (row4.components.length < 5) {
      addButtons(button, row4);
    } else if (row5.components.length < 5) {
      addButtons(button, row5);
    }
  });

  if (row1.components.length > 0) rows.push(row1);
  if (row2.components.length > 0) rows.push(row2);
  if (row3.components.length > 0) rows.push(row3);
  if (row4.components.length > 0) rows.push(row4);
  if (row5.components.length > 0) rows.push(row5);

  return { embeds: [embed], components: rows };
}
