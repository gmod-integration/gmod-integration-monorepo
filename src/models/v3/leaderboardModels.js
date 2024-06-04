import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { dateToDiscordTimestamp, secToTime } from '../../discord/utils/index.js';
import { getTranslate } from '../../utils/localizations.js';
import gm_server_leaderboard_options from '../../database/schema/gm_server_leaderboard_options.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import gm_server_customValues from '../../database/schema/gm_server_customValues.js';

function ButtonLeaderboardFirst(disabled) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('⏪')
    .setCustomId('leaderboard_first');
}

function ButtonLeaderboardPrevious(disabled) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('◀️')
    .setCustomId('leaderboard_previous');
}

function ButtonLeaderboardNext(disabled) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('▶️')
    .setCustomId('leaderboard_next');
}

function ButtonLeaderboardLast(disabled) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('⏩')
    .setCustomId('leaderboard_last');
}

function ButtonLeaderboardRefresh() {
  return new ButtonBuilder().setStyle(ButtonStyle.Secondary).setEmoji('🔄').setCustomId('leaderboard_refresh');
}

export async function getCategoriesEnable(serverID) {
  return await gm_server_customValues.findAll({
    where: {
      serverID: serverID,
      enable: true,
    },
  });
}

const defaultCategories = ['total_time', 'total_kill', 'total_death', 'total_connect', 'last_connect', 'first_connect'];

export async function getServerLeaderboardCategories(serverID) {
  let serverCategories = defaultCategories.slice();

  const categories = await getCategoriesEnable(serverID);
  if (categories) {
    categories.forEach((category) => {
      serverCategories.push(category.value);
    });
  }

  return serverCategories;
}

export function getLeaderboardButtons(disabledPrevious, disabledNext) {
  return new ActionRowBuilder().addComponents(
    ButtonLeaderboardFirst(disabledPrevious),
    ButtonLeaderboardPrevious(disabledPrevious),
    ButtonLeaderboardRefresh(),
    ButtonLeaderboardNext(disabledNext),
    ButtonLeaderboardLast(disabledNext),
  );
}

export async function getServerLeaderboard(serverID, category, limit = 10, offset = 0, order = 'DESC') {
  const total = await gm_server_stat.count({
    where: {
      server_id: serverID,
    },
  });

  const plyStat = await gm_server_stat.findAll({
    where: {
      server_id: serverID,
    },
    order: [[category, order]], // explain this
    limit: limit,
    offset: offset,
  });

  return {
    rows: plyStat,
    query: {
      limit: limit,
      offset: offset,
      order: order,
    },
    total: total,
  };
}

export async function getCatFormat(category, value, lang) {
  switch (category) {
    case 'total_time':
      return secToTime(value);
    case 'total_kill':
      return value + ' ' + (await getTranslate('kill', lang));
    case 'total_death':
      return value + ' ' + (await getTranslate('death', lang));
    case 'total_connect':
      return value + ' ' + (await getTranslate('connect', lang));
    case 'last_connect':
      return dateToDiscordTimestamp(value);
    case 'first_connect':
      return dateToDiscordTimestamp(value);
    case 'money':
      return value.toLocaleString({
        style: 'currency',
        currency: 'USD',
      });
    default:
      return value;
  }
}

export async function getLeaderboardOptions(messageID) {
  return await gm_server_leaderboard_options.findOne({
    where: {
      messageID: messageID,
    },
  });
}

export async function saveLeaderboardOptions(messageID, options) {
  const { serverID, category, limit, offset, order, page, totalPages, total } = options;
  const DBOptions = await gm_server_leaderboard_options.findOne({
    where: {
      messageID: messageID,
    },
  });

  if (DBOptions) {
    DBOptions.page = page;
    DBOptions.totalPages = totalPages;
    DBOptions.limitValue = limit;
    DBOptions.offsetValue = offset;
    DBOptions.orderValue = order;
    DBOptions.total = total;
    await DBOptions.save();
    return DBOptions;
  } else {
    return await gm_server_leaderboard_options.create({
      serverID,
      category,
      messageID,
      page,
      totalPages,
      limitValue: limit,
      offsetValue: offset,
      orderValue: order,
      total,
    });
  }
}

export async function getLeaderboardMessageEmbed(server, category, lang, limit = 15, offset = 0, order = 'DESC') {
  let embed = {
    color: 0x2b2d31,
    title: await getTranslate('leaderboard', lang, [(await getServerFromID(server)).getName()]),
    fields: [],
  };

  let actualPage = 1;
  let totalPages = 1;

  const leaderboardStat = await getServerLeaderboard(server, category, limit, offset, order);

  if (leaderboardStat) {
    for (const data of leaderboardStat.rows) {
      const index = leaderboardStat.rows.indexOf(data);
      const stat = data.dataValues;
      let rank = index + 1 + offset;

      if (offset === 0) {
        if (rank === 1 || rank === 4) {
          embed.fields.push({
            name: '\n',
            value: '',
          });
        }

        let inTop = false;
        switch (rank) {
          case 1:
            rank = '🥇';
            inTop = true;
            break;
          case 2:
            rank = '🥈';
            inTop = true;
            break;
          case 3:
            rank = '🥉';
            inTop = true;
            break;
        }
      }

      embed.fields.push({
        name: '**' + rank + '**' + ' - ' + stat.name,
        value: await getCatFormat(
          category,
          stat[category] || (stat.custom_values && stat.custom_values[category]) || 'total_time',
          lang,
        ),
        inline: true,
      });
    }

    actualPage = Math.ceil(leaderboardStat.query.offset / leaderboardStat.query.limit) + 1;
    totalPages = Math.ceil(leaderboardStat.total / leaderboardStat.query.limit);

    embed.description = await getTranslate('leaderboard_desc', lang, [
      '**' + (await getTranslate(category, lang)) + '**',
      '**' + actualPage + '**',
      '**' + totalPages + '**',
    ]);
  }

  const options = {
    serverID: server,
    category: category,
    limit: limit,
    offset: offset,
    order: order,
    total: leaderboardStat.total,
    page: actualPage,
    totalPages: totalPages,
  };

  return {
    embed,
    options,
  };
}
