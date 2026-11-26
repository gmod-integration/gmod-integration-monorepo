import { getTranslate } from '@gmod/core/utils/localizations.js'
import { gmLog } from '@gmod/shared/logger.js'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js'
import { getEmojiVersion } from '@gmod/core/utils/tools.js'
import { ConfigDiscord, ConfigServer } from '@gmod/config'
import type { Server } from '@gmod/domain-server/Server.js'
import { PlayerGmod } from '@gmod/core/classes/v3/PlayerGmod.js'

export type StatusChartRenderer = (server: Server, options?: { persist?: boolean }) => Promise<Buffer | null>
export type StatusConnectButton = (lang: string, ip: string, port: string) => Promise<ButtonBuilder>

/** Local builder shared by the website preview and real Discord publication. */
export async function buildStatusConnectButton(lang: string, ip: string, port: string) {
  if (ip.includes(':')) ip = ip.split(':')[0]
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('server-connect', lang)}`)
    .setEmoji('🔗')
    .setURL(`${ConfigServer.websiteUrl}/open?link=steam://connect/${ip}:${port}`)
}

export function getEmptyEmbedBuilderField(lineBreak: number = 1) {
  let emptyField = ''
  for (let i = 0; i < lineBreak; i++) {
    emptyField += '\n \u200b'
  }
  return emptyField
}

function normalizePlayersList(rawPlayersList: unknown): any[] {
  if (Array.isArray(rawPlayersList)) {
    return rawPlayersList
  }

  if (typeof rawPlayersList === 'string' && rawPlayersList.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawPlayersList)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

export async function buildServerStatusMessage(
  server: Server,
  data: any,
  lang: string,
  options: { persistChart?: boolean },
  dependencies: { getServerChart: StatusChartRenderer; ButtonConnect: StatusConnectButton },
) {
  const { getServerChart, ButtonConnect } = dependencies
  gmLog('status', 'refresh server status message for ' + server.getID())

  let { servOnline, hostname, map, gameMode, players, maxPlayers, ip, port, playersList } = data || {}
  servOnline = !!hostname
  hostname = hostname === undefined ? await getTranslate('offline', lang) : hostname
  map = map === undefined ? await getTranslate('offline', lang) : map
  gameMode = gameMode === undefined ? await getTranslate('offline', lang) : gameMode
  players = players === undefined ? 0 : players
  maxPlayers = maxPlayers === undefined ? 0 : maxPlayers
  ip = ip === undefined ? '' : ip
  port = port === undefined ? '' : port
  playersList = normalizePlayersList(playersList)

  const showChar = await server.getEffectiveSetting('show_status_chart')
  let bufferChart: Buffer | null = null
  if (showChar) {
    bufferChart =
      options.persistChart === false ? await getServerChart(server, { persist: false }) : await getServerChart(server)
  }

  const embed = new EmbedBuilder()
    .setColor(ConfigDiscord.embedColor)
    .setTitle(await getTranslate('status_of', lang, [server.getName() || server.getID()]))
    .addFields(
      {
        name: '💾⠀' + (await getTranslate('name', lang)),
        value: hostname,
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '📡⠀' + (await getTranslate('status', lang)),
        value: servOnline ? await getTranslate('online', lang) : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '👤⠀' + (await getTranslate('players', lang)),
        value: servOnline ? players + '/' + maxPlayers : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '🗺️⠀' + (await getTranslate('map', lang)),
        value: map,
        inline: true,
      },
      {
        name: '🛻⠀' + (await getTranslate('gamemode', lang)),
        value: gameMode,
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
    )
    .setTimestamp(new Date())

  if (servOnline && playersList.length > 0 && (await server.getEffectiveSetting('show_player_list_status'))) {
    playersList.sort((a: any, b: any) => {
      return b.connectTime - a.connectTime
    })

    const status_player_list_format = await server.getEffectiveSetting('status_player_list_format')

    const playersListString = playersList.map((player: any) => {
      player = new PlayerGmod(player)
      return player.getStringFromString(status_player_list_format)
    })

    // keep under 1024 characters
    let totalLength = 0
    for (let i = 0; i < playersListString.length; i++) {
      totalLength += playersListString[i].length + 1 // +1 for the newline character
      if (totalLength > 800) {
        playersListString.splice(i)
        playersListString.push('...')
        break
      }
    }

    const playerListValue = playersListString.join('\n')
    embed.addFields({
      name: '👤⠀' + (await getTranslate('player_list', lang)),
      value: playerListValue.trim() ? playerListValue : '\u200b',
    })
  }

  if (bufferChart) {
    embed.setImage('attachment://chart.png')
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  const row1 = new ActionRowBuilder<ButtonBuilder>()
  const row2 = new ActionRowBuilder<ButtonBuilder>()
  const row3 = new ActionRowBuilder<ButtonBuilder>()
  const row4 = new ActionRowBuilder<ButtonBuilder>()
  const row5 = new ActionRowBuilder<ButtonBuilder>()
  const buttons = await server.getEffectiveStatusButtons()

  if (servOnline) {
    const connect = await ButtonConnect(lang, ip, port)
    if (buttons.length >= 25) {
      // Discord permits 25 buttons total. Preserve all 25 paid custom buttons and offer
      // the same connection link in the embed when its button row is full.
      const component = connect.toJSON()
      if ('url' in component)
        embed.addFields({
          name: component.label || (await getTranslate('server-connect', lang)),
          value: `[${ip}:${port}](${component.url})`,
          inline: false,
        })
    } else row1.addComponents(connect)
  }

  function addButtons(
    button: {
      name: string
      emoji: string
      url: string
    },
    theRow: ActionRowBuilder<ButtonBuilder>,
  ) {
    let { name, emoji } = button
    const { url } = button

    if (!name || !emoji) {
      return
    }

    name = name.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())

    const emojiVersion = getEmojiVersion(emoji)
    if (!emojiVersion || Number(emojiVersion) > 12) {
      emoji = '❓'
    }

    const theButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(`⠀${name}`)
      .setEmoji(emoji)
      .setURL(`${ConfigServer.websiteUrl}/open?link=${encodeURIComponent(url)}`)

    // Ajouter le bouton à la ligne
    theRow.addComponents(theButton)
  }

  buttons.forEach((button) => {
    if (row1.components.length < 5) {
      addButtons(button, row1)
    } else if (row2.components.length < 5) {
      addButtons(button, row2)
    } else if (row3.components.length < 5) {
      addButtons(button, row3)
    } else if (row4.components.length < 5) {
      addButtons(button, row4)
    } else if (row5.components.length < 5) {
      addButtons(button, row5)
    }
  })

  if (row1.components.length > 0) rows.push(row1)
  if (row2.components.length > 0) rows.push(row2)
  if (row3.components.length > 0) rows.push(row3)
  if (row4.components.length > 0) rows.push(row4)
  if (row5.components.length > 0) rows.push(row5)

  return {
    embeds: [embed],
    components: rows,
    files: bufferChart ? [{ attachment: bufferChart, name: 'chart.png' }] : [],
  }
}
