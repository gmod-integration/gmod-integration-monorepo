import { createHash } from 'node:crypto'
import type { Prisma } from '@gmod/infra-prisma/client.js'
import type { GmodPlayerInput } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import { appendRankingSeedData } from './ranking.js'
import { appendDashboardSeedData } from './dashboard.js'

export const DEV_SEED_LABEL = '[DEMO]'

export type DevSeedOptions = { guildId: string; ownerDiscordId: string; now: Date; assetBaseUrl?: string }

export type DevSeedLog = {
  _id: string
  serverID: string
  type: string
  data: Record<string, unknown>
  playerInvolvedSteamID64: string[]
  createdAt: Date
  updatedAt: Date
}

export type DevSeedError = {
  _id: string
  serverID: string
  count: number
  realm: 'client' | 'server'
  error: string
  stack: string
  name: string
  steamID64: string
  workshopID: string
  uptime: number
  createdAt: Date
  updatedAt: Date
}

export type DevSeedData = {
  serverIds: string[]
  discordServerIds: string[]
  servers: Prisma.gm_serverCreateManyInput[]
  steamUsers: Prisma.gm_user_steamCreateManyInput[]
  users: Prisma.gm_userCreateManyInput[]
  legacyUsers: Prisma.usersCreateManyInput[]
  playerStats: Prisma.gm_server_statCreateManyInput[]
  teamTimes: Prisma.gm_server_stat_team_timeCreateManyInput[]
  sessions: Prisma.gm_server_stat_sessionCreateManyInput[]
  statuses: Prisma.gm_server_statusCreateManyInput[]
  statusHistory: Prisma.gm_server_status_historyCreateManyInput[]
  warns: Prisma.gm_server_warnCreateManyInput[]
  bans: Prisma.gm_server_banCreateManyInput[]
  votes: Prisma.gm_server_voteCreateManyInput[]
  bugReports: Prisma.gm_server_report_bugsCreateManyInput[]
  links: Prisma.gm_server_linksCreateManyInput[]
  notifications: Prisma.gm_users_notificationsCreateManyInput[]
  mongoLogs: DevSeedLog[]
  mongoErrors: DevSeedError[]
  screenshots: Prisma.gm_server_screenshotsCreateManyInput[]
  pseudos: Prisma.gm_server_pseudoCreateManyInput[]
  settings: Prisma.gm_server_settingsCreateManyInput[]
  chatFilters: Prisma.gm_server_sync_chat_filterCreateManyInput[]
  logTriggers: Prisma.gm_server_logs_triggersCreateManyInput[]
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const STEAM_USER_BASE = 76561197960265728n
const names = [
  'Alice Nova',
  'Bastien',
  'Camille',
  'DeltaFox',
  'Ember',
  'Félix',
  'Gaïa',
  'Hugo',
  'Iris',
  'Jules',
  'Kestrel',
  'Luna',
  'Milo',
  'Nora',
  'Orion',
  'Pixel',
  'Quentin',
  'Robin',
  'Sacha',
  'Tango',
  'Ulysse',
  'Vega',
  'Willow',
  'Yuki',
]
const modes = [
  {
    name: 'Atelier DarkRP',
    mode: 'darkrp',
    map: 'rp_downtown_v4c_v2',
    maxPlayers: 64,
    players: 18,
    teams: ['Citoyen', 'Policier', 'Médecin'],
  },
  {
    name: 'Creative Sandbox',
    mode: 'sandbox',
    map: 'gm_construct',
    maxPlayers: 32,
    players: 10,
    teams: ['Constructeur', 'Explorateur', 'Staff'],
  },
  {
    name: 'Soirée TTT',
    mode: 'terrortown',
    map: 'ttt_minecraft_b5',
    maxPlayers: 24,
    players: 0,
    teams: ['Innocent', 'Détective', 'Traître'],
  },
]

/** Build local fixtures only. No client, environment loading, network call or database write. */
export function buildDevSeedData({ guildId, ownerDiscordId, now, assetBaseUrl }: DevSeedOptions): DevSeedData {
  if (!guildId.trim() || !ownerDiscordId.trim() || !Number.isFinite(now.getTime())) {
    throw new Error('A guild, an owner and a valid date are required for development fixtures.')
  }
  const scope = createHash('sha256').update(guildId).digest('hex').slice(0, 8)
  const offset = Number.parseInt(scope.slice(0, 6), 16) % 10_000_000
  const at = (millisecondsAgo: number) => new Date(now.getTime() - millisecondsAgo)
  const documentId = (serverID: string, collection: string, index: number) =>
    createHash('sha256').update(`${serverID}:${collection}:${index}`).digest('hex').slice(0, 24)
  const serverIds = modes.map((_, index) => `demo-${scope}-${String(index + 1).padStart(2, '0')}`)
  const players = Array.from({ length: 120 }, (_, index) => {
    const name = `${names[index % names.length]}${index < names.length ? '' : ` ${Math.floor(index / names.length) + 1}`}`
    // High, synthetic account numbers and future Discord snowflakes avoid known fixture accounts.
    const account = 4_000_000_000n + BigInt(offset * names.length + index)
    return {
      index,
      name: `${name} ${DEV_SEED_LABEL}`,
      steamID64: String(STEAM_USER_BASE + account),
      steamID: `STEAM_0:${account % 2n}:${account / 2n}`,
      discordID: String(9_000_000_000_000_000_000n + BigInt(offset * names.length + index)),
      ip: `198.51.100.${index + 10}`,
      rank: ['superadmin', 'admin', 'moderator', 'vip', 'user', 'user'][index % 6],
    }
  })
  const data: DevSeedData = {
    serverIds,
    discordServerIds: [...serverIds],
    servers: [],
    steamUsers: [],
    users: [],
    legacyUsers: [],
    playerStats: [],
    teamTimes: [],
    sessions: [],
    statuses: [],
    statusHistory: [],
    warns: [],
    bans: [],
    votes: [],
    bugReports: [],
    links: [],
    notifications: [],
    mongoLogs: [],
    mongoErrors: [],
    screenshots: [],
    pseudos: [],
    settings: [],
    chatFilters: [],
    logTriggers: [],
  }

  for (const [serverIndex, mode] of modes.entries()) {
    const serverID = serverIds[serverIndex]
    const inactiveFor = serverIndex === 2 ? 2 * DAY : 0
    const serverDate = at(inactiveFor)
    const ip = `192.0.2.${serverIndex + 10}`
    const livePlayer = (index: number): GmodPlayerInput => {
      const player = players[index % players.length]
      return {
        steamID64: player.steamID64,
        steamID: player.steamID,
        name: player.name,
        userGroup: player.rank,
        kills: index * 2,
        deaths: index,
        connectTime: 900 + index * 180,
        ping: 20 + index * 3,
        fps: 60 + (index % 30),
        branch: 'x86-64',
        customValues: { level: String(5 + index), money: String(1200 + index * 500) },
        team: { id: (index % mode.teams.length) + 1, name: mode.teams[index % mode.teams.length] },
        position: { x: index * 16, y: index * 8, z: 64 },
        angle: { p: 0, y: 90, r: 0 },
        weapon: { class: 'weapon_physgun', printName: 'Physics Gun' },
      }
    }
    data.servers.push({
      id: serverID,
      guild: guildId,
      name: `${DEV_SEED_LABEL} ${mode.name}`,
      token: `demo-only-${scope}-${serverIndex + 1}-not-for-production`,
      ip,
      port: String(27015 + serverIndex),
      image: '',
      verified: true,
      isPublic: false,
      description: `${DEV_SEED_LABEL} Serveur fictif ${mode.mode} pour explorer le dashboard local.`,
      createdAt: at(45 * DAY),
      updatedAt: now,
    })
    data.statuses.push({
      id: serverID,
      ip,
      port: 27015 + serverIndex,
      hostname: `${DEV_SEED_LABEL} ${mode.name}`,
      maxPlayers: mode.maxPlayers,
      players: mode.players,
      playersList: JSON.stringify(Array.from({ length: mode.players }, (_, index) => livePlayer(index))),
      map: mode.map,
      gameMode: mode.mode,
      createdAt: at(45 * DAY),
      updatedAt: serverDate,
    })
    for (let hour = 0; hour < 14 * 24; hour++) {
      const offline = serverIndex === 2 && hour < 48
      const count =
        hour === 0
          ? mode.players
          : offline
            ? 0
            : Math.max(0, Math.round(12 + serverIndex * 2 + 8 * Math.sin(hour / 4) + (hour % 5)))
      const date = at(hour * HOUR)
      data.statusHistory.push({ serverID, players: Math.min(mode.maxPlayers, count), createdAt: date, updatedAt: date })
    }

    for (const player of players) {
      const totalTime = 72_000 + player.index * 3600 + serverIndex * 1800
      const lastConnect = at(inactiveFor + player.index * 35 * 60 * 1000)
      data.playerStats.push({
        server_id: serverID,
        steam_id: player.steamID64,
        name: player.name,
        rank: player.rank,
        total_time: totalTime,
        total_death: 40 + player.index * 3,
        total_kill: 50 + player.index * 5,
        total_money: mode.mode === 'darkrp' ? 1200 + player.index * 2750 : 0,
        total_connect: 14 + player.index,
        first_join: at((40 - (player.index % names.length)) * DAY),
        last_connect: lastConnect,
        custom_values: JSON.stringify({ level: String(5 + player.index), quests: String(player.index % 7) }),
        bypassMaintenance: player.rank === 'superadmin',
        createdAt: at(45 * DAY),
        updatedAt: lastConnect,
      })
      for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
        const teamID = (player.index + teamIndex) % mode.teams.length
        data.teamTimes.push({
          serverID,
          steamID64: player.steamID64,
          team: mode.teams[teamID],
          teamID: teamID + 1,
          time: teamIndex === 0 ? Math.floor(totalTime * 0.6) : totalTime - Math.floor(totalTime * 0.6),
          createdAt: at(30 * DAY),
          updatedAt: lastConnect,
        })
      }
      for (let day = 0; day < 7; day++) {
        const date = at(inactiveFor + day * DAY + (player.index + 1) * 20 * 60 * 1000)
        data.sessions.push({
          serverID,
          steamID64: player.steamID64,
          time: 1800 + (player.index % 6) * 600,
          kills: 2 + (player.index % 8),
          deaths: 1 + (player.index % 4),
          customValues: JSON.stringify({ level: String(5 + player.index) }),
          sessionEndTimeStamp: date,
          createdAt: date,
          updatedAt: date,
        })
      }
    }

    for (let index = 0; index < 32; index++) {
      const date = at((index + 1) * DAY)
      data.warns.push({
        serverID,
        userSteamID64: players[index + 8].steamID64,
        adminSteamID64: players[0].steamID64,
        reason: `${DEV_SEED_LABEL} ${['Spam dans le chat', 'Construction bloquant un passage', 'Non-respect du règlement', 'Comportement antisportif'][index % 4]}`,
        createdAt: date,
        updatedAt: date,
      })
    }
    for (let index = 0; index < 12; index++) {
      const date = at((index === 0 ? 1 : 10) * DAY)
      data.bans.push({
        serverID,
        userSteamID64: players[index + 16].steamID64,
        adminSteamID64: players[0].steamID64,
        reason: `${DEV_SEED_LABEL} Exemple de sanction ${index === 0 ? 'temporaire' : 'expirée'}`,
        time: index === 0 ? 3 * 24 * 60 * 60 : 60 * 60,
        createdAt: date,
        updatedAt: date,
      })
    }
    for (let index = 0; index < 12; index++) {
      const date = at((index + 1) * DAY + serverIndex * HOUR)
      data.votes.push({ serverID, userID: players[index].discordID, createdAt: date, updatedAt: date })
    }
    for (let index = 0; index < 5; index++) {
      const date = at((index + 1) * DAY)
      data.bugReports.push({
        serverID,
        steamID64: players[index + 4].steamID64,
        description: `${DEV_SEED_LABEL} ${['Un élément du HUD reste visible après fermeture', 'Une porte de la carte ne se ferme pas', 'Le score ne se rafraîchit pas immédiatement'][index % 3]}`,
        status: index === 2 ? 'closed' : 'open',
        importance: (['low', 'medium', 'high', 'trivial', 'critical'] as const)[index],
        steps: 'Rejoindre le serveur de démonstration, ouvrir le menu puis effectuer une action.',
        expected: 'Le menu et les informations restent synchronisés.',
        actual: 'Une information reste affichée jusqu’au prochain rafraîchissement.',
        screenshot: '',
        createdAt: date,
        updatedAt: date,
      })
    }
    const logTypes = [
      'player_connect',
      'player_say',
      'player_spawn',
      'player_change_team',
      'player_death',
      'player_disconnect',
    ]
    for (let index = 0; index < 96; index++) {
      const date = at(inactiveFor + (index + 1) * 45 * 60 * 1000)
      const player = players[index % players.length]
      const type = logTypes[index % logTypes.length]
      data.mongoLogs.push({
        _id: documentId(serverID, 'logs', index),
        serverID,
        type,
        data: {
          ply: livePlayer(index),
          name: player.name,
          ip: player.ip,
          text: `${DEV_SEED_LABEL} ${['Bonjour tout le monde !', 'Qui veut construire une base ?', 'Merci pour la partie !'][index % 3]}`,
          teamOnly: index % 2 === 0,
          oldTeam: mode.teams[0],
          newTeam: mode.teams[1],
          plyTarget: livePlayer(index),
          plyAttacker: livePlayer(index + 1),
        },
        playerInvolvedSteamID64: [player.steamID64],
        createdAt: date,
        updatedAt: date,
      })
    }
    for (let index = 0; index < 30; index++) {
      const date = at(inactiveFor + (index + 1) * 6 * HOUR)
      data.mongoErrors.push({
        _id: documentId(serverID, 'errors', index),
        serverID,
        count: 1 + index * 3,
        realm: index % 2 === 0 ? 'server' : 'client',
        error: `${DEV_SEED_LABEL} ${['attempt to index a nil value', 'attempt to call field Refresh (a nil value)', 'unexpected symbol near end'][index % 3]} (${index + 1})`,
        stack: JSON.stringify([{ file: 'addons/demo/lua/demo/example.lua', line: 12 + index, name: 'DemoExample' }]),
        name: 'demo_example',
        steamID64: players[index].steamID64,
        workshopID: '',
        uptime: 3600 + index * 600,
        createdAt: date,
        updatedAt: date,
      })
    }
  }

  const options = { guildId, ownerDiscordId, now, assetBaseUrl }
  appendRankingSeedData(data, options)

  for (const player of players) {
    const stats = data.playerStats.filter((stat) => stat.steam_id === player.steamID64)
    const totalTime = stats.reduce((total, stat) => total + (stat.total_time ?? 0), 0)
    const date = new Date(Math.max(...stats.map((stat) => new Date(stat.last_connect!).getTime())))
    data.steamUsers.push({
      steam_id: player.steamID64,
      username: player.name,
      last_ip: player.ip,
      last_connect: date,
      total_time: totalTime,
      total_death: stats.reduce((total, stat) => total + (stat.total_death ?? 0), 0),
      total_kill: stats.reduce((total, stat) => total + (stat.total_kill ?? 0), 0),
      total_connect: stats.reduce((total, stat) => total + (stat.total_connect ?? 0), 0),
      createdAt: at(45 * DAY),
      updatedAt: date,
    })
    data.users.push({
      id: player.discordID,
      steam: player.steamID64,
      username: player.name,
      rank: 'user',
      trust: Math.min(99, 50 + player.index * 2),
      last_oauth: date,
      createdAt: at(45 * DAY),
      updatedAt: date,
    })
    data.legacyUsers.push({
      steamID64: player.steamID64,
      steamID: player.steamID,
      name: player.name,
      lastIP: player.ip,
      IPS: JSON.stringify([player.ip]),
      createdAt: at(45 * DAY),
      updatedAt: date,
    })
  }
  appendDashboardSeedData(data, options)
  data.links = [
    { alias: `${DEV_SEED_LABEL} Règlement`, url: 'https://example.com/rules' },
    { alias: `${DEV_SEED_LABEL} Documentation`, url: 'https://example.com/docs' },
    { alias: `${DEV_SEED_LABEL} Communauté`, url: 'https://example.com/community' },
  ].map((link) => ({ ...link, guild: guildId, active: false, createdAt: now, updatedAt: now }))
  data.notifications = [
    { type: 'info', message: `${DEV_SEED_LABEL} Les trois serveurs de démonstration sont prêts.` },
    { type: 'info', message: `${DEV_SEED_LABEL} Consultez les statistiques et les sessions des joueurs.` },
    { type: 'warning', message: `${DEV_SEED_LABEL} Un serveur fictif est hors ligne pour tester cet état.` },
  ].map((notification, index) => ({
    ...notification,
    discordID: ownerDiscordId,
    read: index === 1,
    createdAt: at(index * HOUR),
    updatedAt: at(index * HOUR),
  }))
  return data
}
