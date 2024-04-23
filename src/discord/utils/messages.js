import { getTranslate } from '../../utils/localizations.js';
import { gmLog } from '../../utils/logger.js';
import { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { ButtonConnect } from './buttons';

export async function sendOrEditStatusMessage(data, lang, callback) {
  gmLog('refresh status message of ' + data.id + ' (' + data.name + ')');

  const servOnline = !!data.hostname;
  const embed = {
    color: 0x2b2d31,
    title: await getTranslate('status_of', lang, [data.name ? data.name : data.id]),
    fields: [
      {
        name: '💾⠀' + (await getTranslate('name', lang)),
        value: data.hostname ? data.hostname : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '📡⠀' + (await getTranslate('status', lang)),
        value: data.hostname ? await getTranslate('online', lang) : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '',
        inline: true,
      },
      {
        name: '👤⠀' + (await getTranslate('players', lang)),
        value: data.hostname ? data.players + '/' + data.maxplayers : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '🗺️⠀' + (await getTranslate('map', lang)),
        value: data.map ? data.map : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '',
        inline: true,
      },
      {
        name: '🛻⠀' + (await getTranslate('gamemode', lang)),
        value: data.gamemode ? data.gamemode : await getTranslate('offline', lang),
        inline: true,
      },
    ],
    timestamp: new Date(),
  };

  // button, max button by row = 5, max row by message = 5
  let rows = [];

  let row1 = new ActionRowBuilder();
  let row2 = new ActionRowBuilder();
  let row3 = new ActionRowBuilder();
  let row4 = new ActionRowBuilder();
  let row5 = new ActionRowBuilder();

  // Connect button
  const connectButton = ButtonConnect(lang, data.ip, data.port);
  if (servOnline) {
    row1.addComponents(connectButton);
  }

  function addButtons(data, theRow, i) {
    let url = data.button[i].url;
    let name = data.button[i].name;
    let emoji = data.button[i].emoji;

    if (!url || !name || !emoji) {
      return;
    }

    // Créer un bouton
    const button = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(emoji + '⠀' + name)
      // .setEmoji(emoji)
      .setURL('https://gmod-integration.com/open-link?link=' + url);

    // Ajouter le bouton à la ligne
    theRow.addComponents(button);
  }

  // max 5 buttons by row
  if (data.button) {
    for (let i = 0; i < data.button.length; i++) {
      const varI = servOnline ? i + 1 : i;
      if (varI < 5) {
        addButtons(data, row1, i);
      } else if (varI < 10) {
        addButtons(data, row2, i);
      } else if (varI < 15) {
        addButtons(data, row3, i);
      } else if (varI < 20) {
        addButtons(data, row4, i);
      } else if (varI < 25) {
        addButtons(data, row5, i);
      } else {
        console.log('Max button by message is 20');
      }
    }
  }

  // add rows to rows
  if (row1.components.length > 0) rows.push(row1);
  if (row2.components.length > 0) rows.push(row2);
  if (row3.components.length > 0) rows.push(row3);
  if (row4.components.length > 0) rows.push(row4);
  if (row5.components.length > 0) rows.push(row5);

  // return
  callback(embed, rows);
}
