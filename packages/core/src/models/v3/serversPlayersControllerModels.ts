import { badArgument, ipGetIP } from '../../utils/tools.js'
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js'
import { saveConnectionGlobalInfo, saveConnectionSteamInfo, sendPlayerSay } from './serversPlayersModels.js'
import {
  enqueueUpdateGuildUserPseudo,
  enqueueUpdatePlayerUserGroup,
  enqueueUpdateDiscordTeamRole,
} from '@gmod/infra-bullmq/discordQueueAdapters.js'
import prisma from '@gmod/infra-prisma'
import { type Server } from '@gmod/domain-server/Server.js'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'

type EndpointResult = {
  status: number
  body: unknown
}

function getStringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function ok(body: unknown = { success: true }): EndpointResult {
  return { status: 200, body }
}

function bad(body: unknown): EndpointResult {
  return { status: 400, body }
}

function getInvalidPlayerResult(player: PlayerGmod): EndpointResult {
  return bad({ error: 'player_bad_format', arguments: player.isValidGetInformations() })
}

const chatRelayFailureLogs = new Map<string, number>()

export async function processPlayerSay(server: Server, steamID64Param: unknown, body: any): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param)
  const { player, text, teamOnly } = body

  if (badArgument([player, text, teamOnly])) {
    return bad({
      error: 'missing_arguments',
      args: {
        steamID64: !!steamID64,
        player: !!player,
        text: !!text,
        teamOnly: !!teamOnly,
      },
    })
  }

  // throwMissing=false: an invalid payload should produce a graceful player_bad_format response
  // via isValid() below, not an uncaught throw from the constructor itself.
  const ply = new PlayerGmod(player, false)
  if (!ply.isValid()) {
    return getInvalidPlayerResult(ply)
  }

  const result = await sendPlayerSay(server, player, text, teamOnly)
  if (result && 'failed' in result && result.failed) {
    const unavailable = result.status === 503
    const status = unavailable ? 503 : 502
    const serverID = server.getID()
    const now = Date.now()
    const lastLog = chatRelayFailureLogs.get(serverID)
    if (lastLog === undefined || now - lastLog >= 60_000) {
      const relayStatus = result.relayStatus
      const detail =
        typeof relayStatus === 'number' && Number.isInteger(relayStatus) && relayStatus >= 100 && relayStatus <= 599
          ? `HTTP ${relayStatus}`
          : unavailable
            ? 'relay unavailable'
            : 'relay rejected the message'
      console.error(`[chat sync] gmod->discord relay failed for server ${serverID}: ${detail}`)
      chatRelayFailureLogs.set(serverID, now)
      if (chatRelayFailureLogs.size > 1024) chatRelayFailureLogs.delete(chatRelayFailureLogs.keys().next().value!)
    }
    return { status, body: { error: unavailable ? 'chat_relay_unavailable' : 'chat_relay_failed' } }
  }
  return ok()
}

export async function processPlayerChangeName(server: Server, body: any): Promise<EndpointResult> {
  const { player, oldName, newName } = body
  if (badArgument([player, oldName, newName])) {
    return bad({
      error: 'missing_arguments',
      args: {
        oldName: !!oldName,
        newName: !!newName,
      },
    })
  }

  const ply = new PlayerGmod(player, false)
  if (!ply.isValid()) {
    return getInvalidPlayerResult(ply)
  }
  if (await isErasureBlocked(undefined, ply.steamID64)) return ok()

  await enqueueUpdateGuildUserPseudo({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    playerName: ply.name,
    userGroup: ply.userGroup,
    forceName: newName,
  })
  return ok()
}

export async function processPlayerChangeGroup(
  server: Server,
  steamID64Param: unknown,
  body: any,
): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param)
  const { oldGroup, newGroup } = body
  if (badArgument([oldGroup, newGroup])) {
    return bad({
      error: 'missing_arguments',
      args: {
        oldGroup: !!oldGroup,
        newGroup: !!newGroup,
      },
    })
  }
  if (await isErasureBlocked(undefined, steamID64)) return ok()

  await enqueueUpdatePlayerUserGroup({
    serverID: server.getID(),
    steamID64,
    userGroup: newGroup,
  })
  return ok()
}

export async function processPlayerChangeTeam(
  server: Server,
  steamID64Param: unknown,
  body: any,
): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param)
  const { oldTeam, newTeam, player } = body
  if (badArgument([oldTeam, newTeam])) {
    return bad({
      error: 'missing_arguments',
      args: {
        oldTeam: !!oldTeam,
        newTeam: !!newTeam,
      },
    })
  }

  const ply = new PlayerGmod(player, false)
  if (await isErasureBlocked(undefined, steamID64 || ply.steamID64)) return ok()
  if (ply.isValid()) {
    await ply.saveTeamTime(server.getID())
  }

  await enqueueUpdateDiscordTeamRole({
    serverID: server.getID(),
    steamID64,
    teamName: newTeam?.name || null,
  })
  return ok()
}

export async function processPlayerConnect(
  server: Server,
  steamID64Param: unknown,
  body: any,
): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param)
  const { address, name, networkid } = body

  if (badArgument([address, name, networkid, steamID64])) {
    return bad({
      error: 'missing_arguments',
      args: {
        address: !!address,
        name: !!name,
        networkid: !!networkid,
        steam: !!steamID64,
      },
    })
  }

  const ip = ipGetIP(address)
  if (await isErasureBlocked(undefined, steamID64)) return ok()
  await saveConnectionGlobalInfo(steamID64, networkid, ip, name)
  await saveConnectionSteamInfo(steamID64, name, ip)
  await server.saveUserConnectionInfo(steamID64, name)
  return ok()
}

export async function processPlayerDisconnect(server: Server, body: any): Promise<EndpointResult> {
  const { player } = body
  if (badArgument([player])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
      },
    })
  }

  const ply = new PlayerGmod(player, false)
  if (!ply.isValid()) {
    return getInvalidPlayerResult(ply)
  }
  if (await isErasureBlocked(undefined, ply.steamID64)) return ok()

  await ply.saveServerStat(server.getID())
  await ply.saveServerStatSession(server.getID())
  await ply.saveTeamTime(server.getID())
  if (await isErasureBlocked(undefined, ply.steamID64)) return ok()
  await enqueueUpdatePlayerUserGroup({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    userGroup: ply.userGroup,
  })
  await enqueueUpdateGuildUserPseudo({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    playerName: ply.name,
    userGroup: ply.userGroup,
  })
  await enqueueUpdateDiscordTeamRole({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    teamName: null,
  })
  return ok()
}

export async function processPlayerWarn(server: Server, steamID64Param: unknown, body: any): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param)
  const { admin, player, adminSteamID64, reason, date } = body

  if (!admin && !adminSteamID64) {
    return bad({
      error: 'missing_arguments',
      args: { admin: !!admin, adminSteamID64: !!adminSteamID64 },
    })
  }

  let validDate: Date
  if (typeof date === 'string' && !isNaN(Number(date))) {
    validDate = new Date(Number(date) * 1000)
  } else if (typeof date === 'number') {
    validDate = new Date(date * 1000)
  } else {
    throw new Error('Invalid date format')
  }

  const plyAdmin = new PlayerGmod(admin)
  const plyUser = new PlayerGmod(player)
  if (await isErasureBlocked(undefined, plyUser.steamID64 || steamID64)) return ok()
  const author = plyAdmin.steamID64 || adminSteamID64
  const visibleAuthor = (await isErasureBlocked(undefined, author)) ? '' : author

  // `new PlayerGmod(...)` above either succeeds (returning a truthy instance) or throws, so
  // plyUser/plyAdmin are always truthy here - no existence check is needed on them.
  const warn = await prisma.gm_server_warn.create({
    data: {
      serverID: server.getID(),
      userSteamID64: plyUser.steamID64 || steamID64,
      adminSteamID64: visibleAuthor,
      reason,
      createdAt: validDate,
    },
  })
  if (await isErasureBlocked(undefined, plyUser.steamID64 || steamID64)) {
    await prisma.gm_server_warn.deleteMany({ where: { id: warn.id } })
    return ok()
  }
  if (visibleAuthor && (await isErasureBlocked(undefined, author))) {
    await prisma.gm_server_warn.updateMany({
      where: { id: warn.id, adminSteamID64: visibleAuthor },
      data: { adminSteamID64: '' },
    })
    return ok({ ...warn, adminSteamID64: '' })
  }
  return ok(warn)
}
