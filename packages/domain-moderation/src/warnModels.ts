import { ActionRowBuilder, ButtonBuilder, type ButtonInteraction, ButtonStyle, EmbedBuilder } from 'discord.js'
import { getTranslate } from '@gmod/core/utils/localizations.js'
import { getServerFromID, type Server } from '@gmod/domain-server/Server.js'
import prisma from '@gmod/infra-prisma'
import { ConfigDiscord } from '@gmod/config'

export async function getServerUserWarn(
  serverID: string,
  steamID64: string,
  limit: number = 5,
  offset: number = 0,
  order: string = 'DESC',
) {
  const total = await prisma.gm_server_warn.count({
    where: {
      serverID: serverID,
      userSteamID64: steamID64,
    },
  })

  const warnStat = await prisma.gm_server_warn.findMany({
    where: {
      serverID: serverID,
      userSteamID64: steamID64,
    },
    orderBy: {
      createdAt: order === 'ASC' ? 'asc' : 'desc',
    },
    take: limit,
    skip: offset,
  })

  return {
    rows: warnStat,
    query: {
      limit: limit,
      offset: offset,
      order: order,
    },
    total,
  }
}

export async function saveWarnListOptions(
  msgID: string,
  serverID: string,
  steamID64: string,
  options: {
    total?: number
    limit?: number
    offset?: number
    order?: string
  },
) {
  const { total, limit, offset, order } = options
  const oldOptions = await prisma.gm_server_warn_options.findFirst({
    where: {
      msgID,
    },
  })

  if (oldOptions) {
    await prisma.gm_server_warn_options.update({
      where: {
        msgID_steamID64: {
          msgID: msgID,
          steamID64: steamID64,
        },
      },
      data: {
        serverID: serverID,
        steamID64: steamID64,
        total: total,
        limit: limit,
        offset: offset,
        order: order,
      },
    })
  } else {
    await prisma.gm_server_warn_options.create({
      data: {
        msgID: msgID,
        serverID: serverID,
        steamID64: steamID64,
        total: total || 0,
        limit: limit || 5,
        offset: offset || 0,
        order: order || 'DESC',
      },
    })
  }
}

export async function getWarnMessageEmbed(
  server: Server,
  steamID64: string,
  lang: string,
  limit?: number,
  offset?: number,
  order?: string,
) {
  const embed = new EmbedBuilder()
    .setColor(ConfigDiscord.embedColor)
    .setTitle(await getTranslate('warn_for_user', lang, [steamID64, server.getName()]))
    .setTimestamp()

  const warnList = await getServerUserWarn(server.getID(), steamID64, limit, offset, order)
  limit = warnList.query.limit
  offset = warnList.query.offset
  order = warnList.query.order

  let actualPage = offset / limit + 1
  actualPage = actualPage < 1 ? 1 : actualPage
  let totalPages = Math.ceil(warnList.total / limit)
  totalPages = totalPages < 1 ? 1 : totalPages

  // getServerUserWarn() always resolves to a {rows, query, total} object (or throws), so
  // warnList is never falsy here — no guard needed.
  embed.setDescription(
    `${await getTranslate('total_warns', lang)}: **${warnList.total}** , ${await getTranslate('pages', lang)}: **${actualPage} / ${totalPages}**`,
  )
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
  )

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
    )
  }

  const disabledPrevious = offset === 0
  const disabledNext = offset + limit >= warnList.total

  return {
    embed,
    component: new ActionRowBuilder<ButtonBuilder>().addComponents(
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
  }
}

export async function handleWarnInteraction(interaction: ButtonInteraction) {
  if (!interaction.isButton()) return
  if (interaction.user.bot) return
  if (!interaction.guild) return
  if (!interaction.channel) return
  if (!interaction.customId || !interaction.customId.startsWith('warn_')) return

  const lang = interaction.guild.preferredLocale
  const msgID = interaction.message.id
  const optionsOld = await prisma.gm_server_warn_options.findFirst({
    where: {
      msgID: msgID,
    },
  })

  if (!optionsOld) {
    return interaction.reply({ content: await getTranslate('error', lang), ephemeral: true })
  }

  const server = await getServerFromID(optionsOld.serverID)
  if (!server) {
    return interaction.reply({
      content: await getTranslate('server_not_found', lang),
      ephemeral: true,
    })
  }

  let offset = optionsOld.offset
  const limit = optionsOld.limit
  const order = optionsOld.order
  const steamID64 = optionsOld.steamID64

  if (interaction.customId === 'warn_previous') {
    offset = offset - limit
    if (offset < 0) offset = 0
  } else if (interaction.customId === 'warn_next') {
    offset = offset + limit
  } else if (interaction.customId === 'warn_refresh') {
    offset = 0
  }

  const { embed, component, options } = await getWarnMessageEmbed(server, steamID64, lang, limit, offset, order)
  interaction.channel.messages
    .fetch(msgID)
    .then((message) => {
      message.edit({
        embeds: [embed],
        components: [component],
      })
    })
    .then(async () => {
      await saveWarnListOptions(msgID, server.getID(), steamID64, options)
      interaction.deferUpdate()
    })
}
