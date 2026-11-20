import { createHash } from 'node:crypto'
import type { GmodPlayerInput } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import type { DevSeedData, DevSeedOptions } from './data.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const STEAM_BASE = 76561197960265728n
const modes = [
  {
    name: 'Métropole DarkRP',
    mode: 'darkrp',
    map: 'rp_downtown_v4c_v2',
    maxPlayers: 64,
    teams: ['Citoyen', 'Policier'],
  },
  {
    name: 'Creative Builders',
    mode: 'sandbox',
    map: 'gm_construct',
    maxPlayers: 32,
    teams: ['Constructeur', 'Explorateur'],
  },
  {
    name: 'Mystères TTT',
    mode: 'terrortown',
    map: 'ttt_minecraft_b5',
    maxPlayers: 24,
    teams: ['Innocent', 'Détective'],
  },
  { name: 'Midnight Murder', mode: 'murder', map: 'mu_clue', maxPlayers: 20, teams: ['Témoin', 'Enquêteur'] },
  { name: 'Parcours Deathrun', mode: 'deathrun', map: 'deathrun_helix', maxPlayers: 32, teams: ['Coureur', 'Piégeur'] },
  { name: 'Hidden Props', mode: 'prophunt', map: 'ph_office', maxPlayers: 24, teams: ['Objet', 'Chasseur'] },
  {
    name: 'Évasion Jailbreak',
    mode: 'jailbreak',
    map: 'jb_new_summer',
    maxPlayers: 32,
    teams: ['Prisonnier', 'Gardien'],
  },
  { name: 'Galactic Roleplay', mode: 'starwarsrp', map: 'rp_coruscant', maxPlayers: 128, teams: ['Cadet', 'Soldat'] },
  { name: 'Survie Zombie', mode: 'zombiesurvival', map: 'zs_nacht', maxPlayers: 40, teams: ['Survivant', 'Zombie'] },
  {
    name: 'Community Cinema',
    mode: 'cinema',
    map: 'cinema_theater',
    maxPlayers: 16,
    teams: ['Spectateur', 'Projectionniste'],
  },
]

/** Append public ranking fixtures without creating Discord resources or changing the three integration servers. */
export function appendRankingSeedData(
  data: DevSeedData,
  { guildId, now, assetBaseUrl = 'http://localhost:3000' }: DevSeedOptions,
): void {
  const pool = [...new Map(data.playerStats.map((stat) => [stat.steam_id, stat])).values()]
  if (pool.length < 8 || !Number.isFinite(now.getTime())) {
    throw new Error('Ranking fixtures require at least eight existing development players and a valid date.')
  }
  const scope = createHash('sha256').update(guildId).digest('hex').slice(0, 8)
  const assetOrigin = new URL(assetBaseUrl).origin
  const at = (millisecondsAgo: number) => new Date(now.getTime() - millisecondsAgo)
  const documentId = (serverID: string, collection: string, index: number) =>
    createHash('sha256').update(`${serverID}:${collection}:${index}`).digest('hex').slice(0, 24)
  const discordId = (steamId: string) =>
    String(9_000_000_000_000_000_000n + BigInt(steamId) - STEAM_BASE - 4_000_000_000n)

  for (let serverIndex = 0; serverIndex < 100; serverIndex++) {
    const mode = modes[serverIndex % modes.length]
    const serverID = `rank-${scope}-${String(serverIndex + 1).padStart(3, '0')}`
    const players = Array.from(
      { length: Math.min(pool.length, 8 + (serverIndex % 5)) },
      (_, index) => pool[(serverIndex * 7 + index) % pool.length],
    )
    const offline = serverIndex % 9 === 0
    const empty = serverIndex % 13 === 0
    const inactiveFor = offline ? (8 + (serverIndex % 4)) * HOUR : 0
    const population =
      offline || empty ? 0 : serverIndex % 11 === 0 ? players.length : 1 + (serverIndex % players.length)
    const maxPlayers = serverIndex % 11 === 0 ? players.length : mode.maxPlayers
    const ip = `192.0.2.${serverIndex + 100}`
    const name = `[DEMO] [${serverIndex % 3 === 0 ? 'FR' : 'EN'}] ${mode.name} ${String(serverIndex + 1).padStart(3, '0')}`
    const livePlayer = (index: number): GmodPlayerInput => {
      const player = players[index % players.length]
      const account = BigInt(player.steam_id) - STEAM_BASE
      return {
        steamID64: player.steam_id,
        steamID: `STEAM_0:${account % 2n}:${account / 2n}`,
        name: player.name || '[DEMO] Joueur',
        userGroup: player.rank || 'user',
        kills: index * 3,
        deaths: index,
        connectTime: 600 + index * 90,
        ping: 18 + ((serverIndex + index) % 65),
        fps: 45 + ((serverIndex + index) % 100),
        branch: 'x86-64',
        customValues: { level: String(1 + ((serverIndex + index) % 60)) },
        team: { id: (index % 2) + 1, name: mode.teams[index % 2] },
        position: { x: index * 12, y: index * 4, z: 64 },
        angle: { p: 0, y: 90, r: 0 },
        weapon: { class: 'weapon_physgun', printName: 'Physics Gun' },
      }
    }
    data.serverIds.push(serverID)
    data.servers.push({
      id: serverID,
      guild: guildId,
      name,
      token: `demo-only-${scope}-ranking-${serverIndex + 1}-not-for-production`,
      ip,
      port: String(27100 + serverIndex),
      image: `${assetOrigin}/dev-seed/server-${(serverIndex % modes.length) + 1}.svg`,
      verified: serverIndex % 4 !== 0,
      isPublic: true,
      description: `[DEMO] ${serverIndex % 3 === 0 ? 'Communauté fictive francophone' : 'Fictional English-speaking community'} — ${mode.mode}. Classement, votes et activité de développement.`,
      createdAt: at((50 + (serverIndex % 20)) * DAY),
      updatedAt: now,
    })
    data.statuses.push({
      id: serverID,
      ip,
      port: 27100 + serverIndex,
      hostname: name,
      maxPlayers,
      players: population,
      playersList: JSON.stringify(Array.from({ length: population }, (_, index) => livePlayer(index))),
      map: mode.map,
      gameMode: mode.mode,
      createdAt: at(50 * DAY),
      updatedAt: at(offline ? inactiveFor : (serverIndex % 4) * 30_000),
    })
    for (let day = 0; day <= 14; day++) {
      const count =
        day === 0 ? population : Math.max(0, Math.min(maxPlayers, 4 + ((serverIndex * 3 + day * 7) % maxPlayers)))
      const date = at(day * DAY)
      data.statusHistory.push({ serverID, players: count, createdAt: date, updatedAt: date })
    }
    for (const [index, player] of players.entries()) {
      const totalTime = 18_000 + index * 1200 + serverIndex * 60
      const lastConnect = new Date(new Date(player.last_connect!).getTime() - inactiveFor)
      data.playerStats.push({
        ...player,
        server_id: serverID,
        total_time: totalTime,
        total_death: 20 + index,
        total_kill: 40 + index * 2,
        total_money: mode.mode === 'darkrp' ? 1000 + index * 250 : 0,
        total_connect: 5 + index,
        first_join: at(45 * DAY),
        last_connect: lastConnect,
        custom_values: JSON.stringify({ level: String(1 + index), quests: String(serverIndex % 9) }),
        createdAt: at(50 * DAY),
        updatedAt: lastConnect,
      })
      for (let team = 0; team < 2; team++) {
        data.teamTimes.push({
          serverID,
          steamID64: player.steam_id,
          team: mode.teams[team],
          teamID: team + 1,
          time: team === 0 ? Math.floor(totalTime * 0.6) : totalTime - Math.floor(totalTime * 0.6),
          createdAt: at(45 * DAY),
          updatedAt: lastConnect,
        })
      }
      for (let day = 0; day < 2; day++) {
        const date = new Date(lastConnect.getTime() - day * DAY)
        data.sessions.push({
          serverID,
          steamID64: player.steam_id,
          time: 1800 + index * 120,
          kills: 3 + (index % 5),
          deaths: 1 + (index % 3),
          customValues: JSON.stringify({ level: String(1 + index) }),
          sessionEndTimeStamp: date,
          createdAt: date,
          updatedAt: date,
        })
      }
    }
    const recentVotes = (serverIndex * 37) % 100
    for (let index = 0; index < recentVotes + 3; index++) {
      const old = index >= recentVotes
      const date = at((old ? 35 + index - recentVotes : 1 + (index % 25)) * DAY + Math.floor(index / 25) * HOUR)
      data.votes.push({
        serverID,
        userID: discordId(pool[index % pool.length].steam_id),
        createdAt: date,
        updatedAt: date,
      })
    }
    for (let index = 0; index < 2; index++) {
      const date = at((index + 1) * DAY)
      data.warns.push({
        serverID,
        userSteamID64: players[index + 3].steam_id,
        adminSteamID64: players[0].steam_id,
        reason: `[DEMO] ${index === 0 ? 'Spam dans le chat' : 'Non-respect du règlement'}`,
        createdAt: date,
        updatedAt: date,
      })
      data.bugReports.push({
        serverID,
        steamID64: players[index + 1].steam_id,
        description: `[DEMO] ${mode.mode} : ${index === 0 ? 'Un élément du menu reste affiché' : 'Une porte de la carte reste bloquée'}`,
        status: index === 0 ? 'open' : 'closed',
        importance: index === 0 ? 'medium' : 'low',
        steps: 'Rejoindre le serveur de démonstration puis ouvrir le menu.',
        expected: 'Le menu et la carte répondent normalement.',
        actual: 'Un élément reste affiché après fermeture du menu.',
        screenshot: '',
        createdAt: date,
        updatedAt: date,
      })
    }
    const banDate = at((serverIndex % 2 === 0 ? 1 : 10) * DAY)
    data.bans.push({
      serverID,
      userSteamID64: players[5].steam_id,
      adminSteamID64: players[0].steam_id,
      reason: '[DEMO] Sanction de démonstration',
      time: serverIndex % 2 === 0 ? 3 * 24 * 60 * 60 : 3600,
      createdAt: banDate,
      updatedAt: banDate,
    })
    for (const [index, type] of [
      'player_connect',
      'player_say',
      'player_spawn',
      'player_change_team',
      'player_death',
      'player_disconnect',
    ].entries()) {
      const date = at(inactiveFor + (index + 1) * HOUR)
      data.mongoLogs.push({
        _id: documentId(serverID, 'logs', index),
        serverID,
        type,
        data: {
          ply: livePlayer(index),
          name: players[index].name,
          text: '[DEMO] Merci pour la partie !',
          ip: `198.51.100.${index + 10}`,
          teamOnly: false,
          oldTeam: mode.teams[0],
          newTeam: mode.teams[1],
          plyTarget: livePlayer(index),
          plyAttacker: livePlayer(index + 1),
        },
        playerInvolvedSteamID64: [players[index].steam_id],
        createdAt: date,
        updatedAt: date,
      })
    }
    const errorDate = at(inactiveFor + 2 * HOUR)
    data.mongoErrors.push({
      _id: documentId(serverID, 'errors', 0),
      serverID,
      count: 1 + (serverIndex % 9),
      realm: serverIndex % 2 === 0 ? 'server' : 'client',
      error: '[DEMO] attempt to index a nil value',
      stack: JSON.stringify([{ file: 'addons/demo/lua/demo/ranking.lua', line: 12, name: 'DemoRanking' }]),
      name: 'demo_ranking',
      steamID64: players[0].steam_id,
      workshopID: '',
      uptime: 1800 + serverIndex * 60,
      createdAt: errorDate,
      updatedAt: errorDate,
    })
  }
}
