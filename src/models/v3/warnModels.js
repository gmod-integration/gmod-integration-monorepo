import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getTranslate } from '../../utils/localizations.js';
import ServerWarn from '../../database/schema/ServerWarn.js';
import ServerWarnOptions from '../../database/schema/ServerWarnOptions.js';
import { getServerFromID } from '../../classes/v3/Server.js';

export async function getServerUserWarn(serverID, steamID64, limit = 5, offset = 0, order = 'DESC') {
  const total = await ServerWarn.count({
    where: {
      serverID: serverID,
      userSteamID64: steamID64,
    },
  });

  const warnStat = await ServerWarn.findAll({
    where: {
      serverID: serverID,
      userSteamID64: steamID64,
    },
    order: [['createdAt', order]],
    limit: limit,
    offset: offset,
  });

  return {
    rows: warnStat,
    query: {
      limit: limit,
      offset: offset,
      order: order,
    },
    total,
  };
}

export async function saveWarnListOptions(msgID, serverID, steamID64, options) {
  const { total, limit, offset, order } = options;
  const oldOptions = await ServerWarnOptions.findOne({
    where: {
      msgID: msgID,
    },
  });

  if (oldOptions) {
    await oldOptions.update({
      serverID: serverID,
      steamID64: steamID64,
      total: total,
      limit: limit,
      offset: offset,
      order: order,
    });
  } else {
    await ServerWarnOptions.create({
      msgID: msgID,
      serverID: serverID,
      steamID64: steamID64,
      total: total,
      limit: limit,
      offset: offset,
      order: order,
    });
  }
}

export async function getWarnMessageEmbed(server, steamID64, lang, limit, offset, order) {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(await getTranslate('warn_for_user', lang, [steamID64, server.getName()]))
    .setTimestamp();

  const warnList = await getServerUserWarn(server.getID(), steamID64, limit, offset, order);
  limit = warnList.query.limit;
  offset = warnList.query.offset;
  order = warnList.query.order;

  let actualPage = offset / limit + 1;
  actualPage = actualPage < 1 ? 1 : actualPage;
  let totalPages = Math.ceil(warnList.total / limit);
  totalPages = totalPages < 1 ? 1 : totalPages;

  if (warnList) {
    embed.setDescription(
      `${await getTranslate('total_warns', lang)}: **${warnList.total}** , ${await getTranslate('pages', lang)}: **${actualPage} / ${totalPages}**`,
    );
    embed.addFields(
      {
        name: await getTranslate('date', lang),
        value: '\n',
        inline: true,
      },
      {
        name: await getTranslate('reason', lang),
        value: '\n',
        inline: true,
      },
      {
        name: ' ',
        value: ' ',
        inline: true,
      },
    );

    for (const data of warnList.rows) {
      embed.addFields(
        {
          name: '\n',
          value: new Date(data.createdAt).toLocaleDateString(lang),
          inline: true,
        },
        {
          name: '\n',
          value: data.reason || (await getTranslate('no_reason', lang)),
          inline: true,
        },
        {
          name: ' ',
          value: ' ',
          inline: true,
        },
      );
    }
  }

  const disabledPrevious = offset === 0;
  const disabledNext = offset + limit >= warnList.total;

  return {
    embed,
    component: new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabledPrevious)
        .setEmoji('◀️')
        .setCustomId('warn_previous'),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setEmoji('🔄').setCustomId('warn_refresh'),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabledNext)
        .setEmoji('▶️')
        .setCustomId('warn_next'),
    ),
    options: {
      total: warnList.total,
      limit: limit,
      offset: offset,
      order: order,
    },
  };
}

export async function handleWarnInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (!interaction.guild) return;
  if (!interaction.customId || !interaction.customId.startsWith('warn_')) return;

  const lang = interaction.guild.preferredLocale;
  const msgID = interaction.message.id;
  const optionsOld = await ServerWarnOptions.findOne({
    where: {
      msgID: msgID,
    },
  });
  if (!optionsOld) {
    return interaction.reply({ content: await getTranslate('error', lang), ephemeral: true });
  }

  const server = await getServerFromID(optionsOld.serverID);
  if (!server) {
    return interaction.reply({
      content: await getTranslate('server_not_found', lang),
      ephemeral: true,
    });
  }

  let offset = optionsOld.offset;
  let limit = optionsOld.limit;
  let order = optionsOld.order;
  const steamID64 = optionsOld.steamID64;

  if (interaction.customId === 'warn_previous') {
    offset = offset - limit;
    if (offset < 0) offset = 0;
  } else if (interaction.customId === 'warn_next') {
    offset = offset + limit;
  } else if (interaction.customId === 'warn_refresh') {
    offset = 0;
  }

  const { embed, component, options } = await getWarnMessageEmbed(server, steamID64, lang, limit, offset, order);
  interaction.channel.messages
    .fetch(msgID)
    .then((message) => {
      message.edit({
        embeds: [embed],
        components: [component],
      });
    })
    .then(async () => {
      await saveWarnListOptions(msgID, server.getID(), steamID64, options);
      interaction.deferUpdate();
    });
}
