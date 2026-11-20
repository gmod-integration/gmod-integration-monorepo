import type { GmodPlayerInput } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import type { DevSeedData, DevSeedOptions } from './data.js'

const HOUR = 60 * 60 * 1000
const DEMO = '[DEMO]'

/** Add dashboard examples to the three integrated servers, independently of the public directory. */
export function appendDashboardSeedData(data: DevSeedData, options: DevSeedOptions): void {
  const assetBase = new URL(options.assetBaseUrl || 'http://localhost:3000')
  if (!['http:', 'https:'].includes(assetBase.protocol) || assetBase.username || assetBase.password) {
    throw new Error('Development screenshot assets require an HTTP website URL without credentials.')
  }

  for (const [serverIndex, serverID] of data.discordServerIds.entries()) {
    const players = data.playerStats.filter((row) => row.server_id === serverID)
    const status = data.statuses.find((row) => row.id === serverID)
    if (!players.length || !status)
      throw new Error(`Dashboard fixtures require player statistics and status for ${serverID}.`)

    for (let index = 0; index < 24; index++) {
      const stat = players[index % players.length]
      const legacy = data.legacyUsers.find((row) => row.steamID64 === stat.steam_id)
      if (!legacy?.steamID) throw new Error(`Dashboard screenshots require a Steam identity for ${stat.steam_id}.`)
      const player: GmodPlayerInput = {
        steamID64: stat.steam_id,
        steamID: legacy.steamID,
        name: stat.name || `${DEMO} Joueur`,
        userGroup: stat.rank || 'user',
        kills: index * 2,
        deaths: index,
        connectTime: 900 + index * 180,
        ping: 25 + index,
        fps: 60 + (index % 30),
        branch: 'x86-64',
        customValues: JSON.parse(stat.custom_values),
        team: {
          id: 1,
          name:
            data.teamTimes.find((row) => row.serverID === serverID && row.steamID64 === stat.steam_id)?.team ||
            'Joueur',
        },
        position: { x: index * 64, y: index * 32, z: 64 },
        angle: { p: 0, y: index * 15, r: 0 },
        weapon: { class: 'weapon_physgun', printName: 'Physics Gun' },
      }
      const date = new Date(options.now.getTime() - (index + 1) * 3 * HOUR)
      data.screenshots.push({
        serverID,
        title: `${DEMO} ${['Construction de la base', 'Vue de la carte', 'Scène de démonstration'][index % 3]} ${String(index + 1).padStart(2, '0')}`,
        player: JSON.stringify(player),
        captureData: JSON.stringify({
          x: 0,
          y: 0,
          w: 1920,
          h: 1080,
          quality: 85,
          format: 'svg',
          map: status.map,
          demo: true,
        }),
        url: new URL(`/dev-seed/capture-${(index % 3) + 1}.svg`, assetBase).toString(),
        createdAt: date,
        updatedAt: date,
      })
    }

    for (const [role, name, prefix, enabled] of [
      ['superadmin', `${DEMO} Administration`, '[SA]', true],
      ['admin', `${DEMO} Modération`, '[A]', true],
      ['vip', `${DEMO} VIP`, '[VIP]', true],
      ['user', `${DEMO} Joueur`, '[J]', false],
    ] as const) {
      data.pseudos.push({ serverID, role, name, prefix, enabled, createdAt: options.now, updatedAt: options.now })
    }

    for (const [setting, value] of Object.entries({
      ig_language: serverIndex === 2 ? 'en' : 'fr',
      ig_maintenance: serverIndex === 2 ? 'true' : 'false',
      ig_adminRank: JSON.stringify({ superadmin: true, admin: true }),
      ig_supportLink: 'https://example.com/support',
      ig_logTimestamp: '%H:%M:%S',
      ig_debug: 'false',
      ig_syncBan: 'true',
      ig_syncTimeout: 'false',
      ig_syncKick: 'false',
      pseudoFormat: '{rolePrefix} {plyName}',
      sync_pseudo_direction: 'gmod-to-discord',
      log_hide_ip: 'true',
      log_include_file: 'false',
    })) {
      data.settings.push({ serverID, setting, value, createdAt: options.now, updatedAt: options.now })
    }

    for (const filter of [
      { element: 'message', operator: 'startWith', trigger: `${DEMO} privé`, action: 'block', active: true },
      { element: 'userGroup', operator: 'equal', trigger: 'vip', action: 'relay', active: false },
      { element: 'teamName', operator: 'equal', trigger: 'Citoyen', action: 'anonymize', active: false },
    ] as const) {
      data.chatFilters.push({ ...filter, serverID, createdAt: options.now, updatedAt: options.now })
    }

    if (status.gameMode === 'darkrp') {
      for (const { log_type, value, message } of [
        {
          log_type: 'dark_rp_drop_money',
          value: '1000000',
          message: `${DEMO} Argent au sol : {{data.amount}} par {{data.player.name}} ({{data.player.steamID64}}).`,
        },
        {
          log_type: 'dark_rp_picked_up_cheque',
          value: '5000000',
          message: `${DEMO} Chèque de {{data.playerChequeWriter.name}} encaissé par {{data.playerChequeTarget.name}} : {{data.amount}}.`,
        },
      ]) {
        data.logTriggers.push({
          serverID,
          log_type,
          value,
          compare: 'amount',
          operator: 'greaterThan',
          action: 'sendMessageInChannel',
          // The writer can bind the actual demo logs channel; the pure dataset never invents a Discord destination.
          channelID: '',
          adminIDS: '[]',
          message,
          createdAt: options.now,
          updatedAt: options.now,
        })
      }
    }
  }
}
