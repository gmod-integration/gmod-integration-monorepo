import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { dateToDiscordTimestamp, secToTime } from '../../discord/utils/index.js';
import { getTranslate } from '../../utils/localizations.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import index from '../../services/prisma/index.js';
import { ConfigDiscord } from '../../classes/config/Config.js';

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

const defaultCategories = ['total_time', 'total_kill', 'total_death', 'total_connect', 'last_connect', 'first_join'];

export async function getServerLeaderboardCategories(serverID: string) {
  let serverCategories = defaultCategories.slice();

  const categories = await index.gm_server_customValues.findMany({
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
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
  const total = await index.gm_server_stat.count({
    where: {
      server_id: serverID,
    },
  });

  const plyStat = await index.gm_server_stat.findMany({
    where: {
      server_id: serverID,
    },
    orderBy: {
      [category]: order === 'ASC' ? 'asc' : 'desc',
    },
    take: limit || 10,
    skip: offset || 0,
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
    case 'first_join':
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
  const DBOptions = await index.gm_server_leaderboard_options.findFirst({
    where: {
      messageID: messageID,
    },
  });

  if (DBOptions) {
    return index.gm_server_leaderboard_options.update({
      where: {
        messageID_serverID: {
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
    return index.gm_server_leaderboard_options.create({
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
    .setColor(ConfigDiscord.embedColor)
    .setFields([]);

  const leaderboardStat = await getServerLeaderboard(server.getID(), category, limit, offset, order);

  if (leaderboardStat) {
    for (const stat of leaderboardStat.rows) {
      const index = leaderboardStat.rows.indexOf(stat);
      let rank: any = index + 1 + offset;

      let inTop = false;
      if (offset === 0) {
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

      const fieldValue =
        (await getCatFormat(
          category,
          (stat as any)[category] || (stat.custom_values && (stat.custom_values as any)[category]) || 'total_time',
          lang,
        )) || '0';

      if (fieldValue.trim().length > 0) {
        embed.addFields({
          name: '**' + rank + '**' + ' - ' + stat.name,
          value: fieldValue.toString() + (inTop && leaderboardStat.total > 4 ? '  \n \u200b' : ''),
          inline: true,
        });
      }
    }

    const actualPage = Math.ceil((offset + 1) / limit);
    const totalPages = Math.ceil(leaderboardStat.total / limit);

    embed.setDescription(
      await getTranslate('leaderboard_desc', lang, [
        '**' + (await getTranslate(category, lang)) + '**',
        '**' + actualPage + '**',
        '**' + totalPages + '**',
      ]),
    );

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

export async function handleLeaderboardInteraction(interaction: ButtonInteraction) {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (!interaction.guild) return;
  if (!interaction.customId.startsWith('leaderboard_')) return;
  const lang = interaction.guild.preferredLocale;

  const options = await index.gm_server_leaderboard_options.findFirst({
    where: {
      messageID: interaction.message.id,
    },
  });

  if (!options) {
    return interaction.reply({ content: await getTranslate('error', lang) });
  }

  let offset = options.offsetValue;
  let limit = options.limitValue;
  let messageID = options.messageID;
  let total = options.total || 0;

  if (interaction.customId === 'leaderboard_previous') {
    offset = offset - limit;
    if (offset < 0) offset = 0;
  } else if (interaction.customId === 'leaderboard_next') {
    offset = offset + limit;
  } else if (interaction.customId === 'leaderboard_first') {
    offset = 0;
  } else if (interaction.customId === 'leaderboard_last') {
    offset = options.total ? options.total - limit : 0;
    if (offset < 0) offset = 0;
  }

  const leaderboardMessage = await getLeaderboardMessageEmbed(options.serverID, options.category, lang, limit, offset);
  if (!leaderboardMessage) {
    return interaction.reply({ content: 'Failed to retrieve leaderboard data.', ephemeral: true });
  }

  const { embed, options: options2nd } = leaderboardMessage;
  if (interaction.channel) {
    interaction.channel.messages.fetch(messageID).then((message) => {
      message
        .edit({
          embeds: [embed],
          components: [getLeaderboardButtons(options2nd.page === 1, options2nd.page === options2nd.totalPages)],
        })
        .then(() => {
          saveLeaderboardOptions(messageID, options2nd).then(() => {
            interaction.deferUpdate();
          });
        });
    });
  }
}
