import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Interaction } from 'discord.js';
import { dateToDiscordTimestamp, secToTime } from '../../discord/utils';
import { getTranslate } from '../../utils/localizations';
import { getServerFromID } from '../../classes/v3/Server';
import prisma from '../../prisma';

function ButtonLeaderboardFirst(disabled: boolean) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('⏪')
    .setCustomId('leaderboard_first');
}

function ButtonLeaderboardPrevious(disabled: boolean) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('◀️')
    .setCustomId('leaderboard_previous');
}

function ButtonLeaderboardNext(disabled: boolean) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('▶️')
    .setCustomId('leaderboard_next');
}

function ButtonLeaderboardLast(disabled: boolean) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)
    .setEmoji('⏩')
    .setCustomId('leaderboard_last');
}

function ButtonLeaderboardRefresh() {
  return new ButtonBuilder().setStyle(ButtonStyle.Secondary).setEmoji('🔄').setCustomId('leaderboard_refresh');
}

const defaultCategories = ['total_time', 'total_kill', 'total_death', 'total_connect', 'last_connect', 'first_connect'];

export async function getServerLeaderboardCategories(serverID: string) {
  let serverCategories = defaultCategories.slice();

  const categories = await prisma.gm_server_customValues.findMany({
    where: {
      serverID: serverID,
      enable: true,
    },
  });

  if (categories) {
    categories.forEach((category) => {
      serverCategories.push(category.valueName);
    });
  }

  return serverCategories;
}

export function getLeaderboardButtons(disabledPrevious: boolean, disabledNext: boolean) {
  return new ActionRowBuilder().addComponents(
    ButtonLeaderboardFirst(disabledPrevious),
    ButtonLeaderboardPrevious(disabledPrevious),
    ButtonLeaderboardRefresh(),
    ButtonLeaderboardNext(disabledNext),
    ButtonLeaderboardLast(disabledNext),
  );
}

export async function getServerLeaderboard(
  serverID: string,
  category: string,
  limit: number = 10,
  offset: number = 0,
  order: string = 'DESC',
) {
  const total = await prisma.gm_server_stat.count({
    where: {
      server_id: serverID,
    },
  });

  const plyStat = await prisma.gm_server_stat.findMany({
    where: {
      server_id: serverID,
    },
    orderBy: {
      [category]: order,
    },
    take: limit,
    skip: offset,
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

export async function getCatFormat(category: string, value: any, lang: string) {
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

export async function saveLeaderboardOptions(messageID: string, options: any) {
  const { serverID, category, limit, offset, order, page, totalPages, total } = options;
  const DBOptions = await prisma.gm_server_leaderboard_options.findFirst({
    where: {
      messageID: messageID,
    },
  });

  if (DBOptions) {
    return prisma.gm_server_leaderboard_options.update({
      where: {
        serverID_messageID: {
          serverID: serverID,
          messageID: messageID,
        },
      },
      data: {
        page,
        totalPage: totalPages,
        limitValue: limit,
        offsetValue: offset,
        orderValue: order,
        total,
      },
    });
  } else {
    return prisma.gm_server_leaderboard_options.create({
      data: {
        serverID,
        category,
        messageID,
        page,
        totalPage: totalPages,
        limitValue: limit,
        offsetValue: offset,
        orderValue: order,
        total,
      },
    });
  }
}

export async function getLeaderboardMessageEmbed(
  serverID: string,
  category: string,
  lang: string,
  limit: number = 15,
  offset: number = 0,
  order: string = 'DESC',
) {
  const server = await getServerFromID(serverID);
  if (!server) throw new Error('Server not found');

  let embed = new EmbedBuilder()
    .setTitle(await getTranslate('leaderboard', lang, [server.getName()]))
    .setColor(0x2b2d31)
    .setFields([]);

  let actualPage = 1;
  let totalPages = 1;

  const leaderboardStat = await getServerLeaderboard(server.getID(), category, limit, offset, order);

  if (leaderboardStat) {
    for (const stat of leaderboardStat.rows) {
      const index = leaderboardStat.rows.indexOf(stat);
      let rank: any = index + 1 + offset;

      if (offset === 0) {
        if (rank === 1 || rank === 4) {
          embed.addFields({
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

      embed.addFields({
        name: '**' + rank + '**' + ' - ' + stat.name,
        value: await getCatFormat(
          category,
          stat[category] || (stat.custom_values && stat.custom_values[category]) || 'total_time',
          lang,
        ),
        inline: true,
      });

      actualPage = Math.ceil(leaderboardStat.query.offset / leaderboardStat.query.limit) + 1;
      totalPages = Math.ceil(leaderboardStat.total / leaderboardStat.query.limit);

      embed.setDescription(
        await getTranslate('leaderboard_desc', lang, [
          '**' + (await getTranslate(category, lang)) + '**',
          '**' + actualPage + '**',
          '**' + totalPages + '**',
        ]),
      );
    }

    const options = {
      serverID: server.getID(),
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
}

export async function handleLeaderboardInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (!interaction.guild) return;
  if (!interaction.customId.startsWith('leaderboard_')) return;
  const lang = interaction.guild.preferredLocale;

  const options = await prisma.gm_server_leaderboard_options.findFirst({
    where: {
      messageID: interaction.message.id,
    },
  });

  if (!options) {
    interaction.reply({ content: getTranslate('error', lang) });
    return;
  }

  let offset = options.offsetValue;
  let limit = options.limitValue;
  let messageID = options.messageID;

  if (interaction.customId === 'leaderboard_previous') {
    offset = offset - limit;
    if (offset < 0) offset = 0;
  } else if (interaction.customId === 'leaderboard_next') {
    offset = offset + limit;
  } else if (interaction.customId === 'leaderboard_first') {
    offset = 0;
  } else if (interaction.customId === 'leaderboard_last') {
    offset = options.total - limit;
    if (offset < 0) offset = 0;
  }

  const { embed, options } = await getLeaderboardMessageEmbed(options.serverID, options.category, lang, limit, offset);
  interaction.channel.messages.fetch(messageID).then((message) => {
    message
      .edit({
        embeds: [embed],
        components: [getLeaderboardButtons(options.page === 1, options.page === options.totalPages)],
      })
      .then(() => {
        saveLeaderboardOptions(messageID, options).then(() => {
          interaction.deferUpdate();
        });
      });
  });
}
