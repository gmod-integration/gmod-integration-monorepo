import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import {
  assertPersonalDataAllowed,
  getRetainedTrust,
  isErasureBlocked,
  PersonalDataErasureError,
  prepareExplicitOAuthLogin,
} from '@gmod/domain-user/privacy.js'
import { getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { isGuildPremium } from './Guild.js'
import { limitResources, resolveGuildAccess } from '@gmod/domain-access/index.js'
import { ConfigDiscord } from '@gmod/config'
import {
  DiscordOAuthError,
  exchangeDiscordCode,
  exchangeDiscordRefreshToken,
  refreshDiscordCredentials,
  saveDiscordCredentials,
} from '@gmod/domain-auth/discordOAuth.js'
import { createApplicationSession } from '@gmod/domain-auth/authSessions.js'
import redis from '@gmod/infra-redis'
import prisma from '@gmod/infra-prisma'
import { type Guild, type GuildMember } from 'discord.js'
import type { PanelUser } from '@gmod/domain-user/PanelUser.js'
import { type WSSendToServerData, wsSendToServerQueue } from '@gmod/infra-websocket/queues.js'
import { ensureAvatarStored } from '@gmod/infra-minio'
import {
  enqueueMainClientFetchUser,
  enqueueMainClientSyncPremiumRoles,
} from '@gmod/infra-bullmq/discordQueueAdapters.js'

function getDiscordGuildIconCdnUrl(guildID: string, icon: string | null | undefined): string | null {
  if (!icon) {
    return null
  }

  return `https://cdn.discordapp.com/icons/${guildID}/${icon}.png?size=256`
}

export async function updateRolesToGmod(member: GuildMember, oldMember: GuildMember, newMember: GuildMember) {
  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id))
  const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id))

  const servers = await getServersFromDiscordGuildID(member.guild.id)
  if (!servers || servers.length === 0) {
    return
  }

  const user = await getUserFromDiscordID(member.id)
  if (!user || !user.getSteamID64()) {
    return
  }

  for (const server of servers) {
    const syncDirection = await server.getEffectiveSetting('sync_role_direction')
    if (syncDirection !== 'both' && syncDirection !== 'discord-to-gmod') {
      continue
    }

    // Disabled mappings must neither grant a fallback role nor hide an enabled fallback.
    const syncRoles = (await server.getEffectiveSyncRoles())?.filter((rule) => rule.enable === true)
    if (!syncRoles || syncRoles.length === 0) {
      continue
    }

    // skip for now
    const redisKey = `sync-role:gmod:server:${server.id}:user:${user.getSteamID64()}`
    const redisData = await redis.get(redisKey)
    const data = redisData ? JSON.parse(redisData) : { removeIDs: [], addIDs: [] }

    // add roles
    for (const roleCollection of addedRoles) {
      const role = roleCollection[1]
      if (data && data.addIDs.includes(role.id)) {
        continue
      }

      const roleData = syncRoles.find((syncRole) => syncRole.roleID === role.id)
      if (!roleData || !roleData.enable) {
        continue
      }

      // remove all roles except the one we are adding
      const userRoles = member.roles.cache
      const rolesToRemove = userRoles.filter(
        (role) =>
          syncRoles.some((syncRole) => syncRole.roleID === role.id && syncRole.enable) && role.id !== roleData?.roleID,
      )

      if (rolesToRemove.size > 0) {
        data.removeIDs.push(...rolesToRemove.map((role) => role.id))
        await redis.set(redisKey, JSON.stringify(data), 'EX', 120)
        await member.roles.remove(rolesToRemove)
      }

      await wsSendToServerQueue.add('wsSendToServer', {
        id: server.getID(),
        data: {
          method: 'wsPlayerUpdateGroup',
          steamID64: user.getSteamID64(),
          group: roleData.userGroup,
          add: true,
        },
      } as WSSendToServerData)
    }

    for (const roleCollection of removedRoles) {
      const role = roleCollection[1]
      if (data && data.removeIDs.includes(role.id)) {
        continue
      }

      const roleData = syncRoles.find((syncRole) => syncRole.roleID === role.id)
      if (!roleData || !roleData.enable) {
        continue
      }

      if (data.addIDs.includes(roleData.roleID)) {
        data.addIDs = data.addIDs.filter((id: string) => id !== roleData.roleID)
        await redis.set(redisKey, JSON.stringify(data), 'EX', 120)
      }

      await wsSendToServerQueue.add('wsSendToServer', {
        id: server.getID(),
        data: {
          method: 'wsPlayerUpdateGroup',
          steamID64: user.getSteamID64(),
          group: roleData.userGroup,
          add: false,
        },
      } as WSSendToServerData)
    }

    // if no sync role anymore check id a 'user' role is present in sync and add it
    const userRoles = member.roles.cache
    const syncedRole = userRoles.filter((role) => syncRoles.some((syncRole) => syncRole.roleID === role.id))
    if (syncedRole.size === 0 && data.addIDs.length === 0) {
      const userRole = syncRoles.find((syncRole) => syncRole.userGroup === 'user')
      if (userRole) {
        data.addIDs.push(userRole.roleID)
        await redis.set(redisKey, JSON.stringify(data), 'EX', 2)
        await member.roles.add(userRole.roleID)
      }
    }
  }
}

export async function updateGuildStat(guild: Guild) {
  const guildDB = await prisma.gm_guild.findUnique({
    where: {
      guild: guild.id,
    },
  })

  if (!guildDB) {
    await prisma.gm_guild.create({
      data: {
        guild: guild.id,
        name: guild.name,
        member: guild.memberCount,
        language: guild.preferredLocale,
      },
    })
  } else {
    await prisma.gm_guild.update({
      where: {
        guild: guild.id,
      },
      data: {
        member: guild.memberCount,
        language: guild.preferredLocale,
        name: guild.name,
        updatedAt: new Date(),
      },
    })
  }
}

export async function addAutoRoleToUser(guild: Guild, member: GuildMember) {
  // findMany() always resolves to an array (never null), so no falsy guard is needed here.
  const roles = await prisma.gm_guild_auto_roles.findMany({
    where: {
      guildID: guild.id,
    },
    orderBy: [{ createdAt: 'asc' }, { roleID: 'asc' }],
  })

  const effectiveRoles = limitResources(await resolveGuildAccess(guild.id), 'guild.auto_roles', roles)
  for (const roleData of effectiveRoles) {
    const roleDiscord = guild.roles.cache.get(roleData.roleID)
    if (!roleDiscord) {
      await prisma.gm_guild_auto_roles.delete({
        where: {
          roleID: roleData.roleID,
          guildID: guild.id,
        },
      })
      continue
    }

    if (member.roles.cache.has(roleData.roleID)) continue
    await member.roles.add(roleDiscord)
  }

  return true
}

export async function addVerifyRoleToUser(guild: Guild, member: GuildMember) {
  // findMany() always resolves to an array (never null), so no falsy guard is needed here.
  const role = await prisma.gm_guild_verify_role.findMany({
    where: {
      guildID: guild.id,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  const effectiveRoles = limitResources(await resolveGuildAccess(guild.id), 'verification.roles', role)
  for (const roleData of effectiveRoles) {
    const roleDiscord = guild.roles.cache.get(roleData.roleID)
    if (!roleDiscord) {
      await prisma.gm_guild_verify_role.delete({
        where: {
          id: roleData.id,
        },
      })
      continue
    }

    // if not enabled skip
    if (!roleData.enabled) continue

    // give or remove role
    if (roleData.isGiveRole) {
      if (member.roles.cache.has(roleData.roleID)) continue
      await member.roles.add(roleDiscord)
    } else {
      if (!member.roles.cache.has(roleData.roleID)) continue
      await member.roles.remove(roleDiscord)
    }
  }
}

export async function verifyUser(guild: Guild, member: GuildMember) {
  const user = await getUserFromDiscordID(member.id)
  if (!user || !user.getSteamID64()) return false

  await addVerifyRoleToUser(guild, member)
  return true
}

export async function getUserGuildsWithPermsForPanel(panelUser: PanelUser) {
  const guilds = []
  const permGuilds = await panelUser.findGuildsWithPerms()
  const permGuildsID = permGuilds.map((guild) => guild.id)

  const rows = await prisma.gm_guild.findMany({
    where: {
      guild: {
        in: permGuildsID,
      },
    },
  })

  const hasBotGuildsID = []
  for (const guildData of rows) {
    hasBotGuildsID.push(guildData.guild)
  }

  for (const guildData of permGuilds) {
    const guildID = guildData.id

    // guildID was derived from permGuilds itself (permGuildsID is permGuilds.map(g => g.id)),
    // so it is always present in permGuildsID - no filtering is needed here.
    const icon = await ensureAvatarStored(
      'guild',
      guildID,
      getDiscordGuildIconCdnUrl(guildID, typeof guildData.icon === 'string' ? guildData.icon : null),
    )

    guilds.push({
      id: guildID,
      name: guildData.name,
      icon,
      hasBot: hasBotGuildsID.includes(guildID),
      isOwner: guildData.owner,
      isPremium: hasBotGuildsID.includes(guildID) ? await isGuildPremium(guildID) : false,
    })
  }

  return guilds
}

export async function getUserTokenFromCode(code: string, redirectURI: string, codeVerifier?: string) {
  try {
    return await exchangeDiscordCode(code, redirectURI, codeVerifier)
  } catch (error) {
    if (error instanceof DiscordOAuthError && error.code === 'grant_rejected') return null
    throw error
  }
}

export async function getUserTokenFromRefreshToken(refreshToken: string) {
  return exchangeDiscordRefreshToken(refreshToken)
}

export async function refreshUserToken(discordID: string) {
  return refreshDiscordCredentials(discordID)
}

interface DiscordUserProfile {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
  discriminator?: string
}

export async function getUserFromToken(token: string): Promise<DiscordUserProfile | null> {
  let discordRequest: Response
  try {
    discordRequest = await fetch('https://discord.com/api/users/@me', {
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: token,
      },
    })
  } catch {
    throw new DiscordOAuthError('provider_unavailable')
  }

  if (!discordRequest.ok) {
    console.error(`[discord oauth] users/@me failed: status=${discordRequest.status}`)
    return null
  }

  let profile: unknown
  try {
    profile = await discordRequest.json()
  } catch {
    throw new DiscordOAuthError('provider_unavailable')
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null
  const user = profile as Record<string, unknown>
  if (typeof user.id !== 'string' || !/^\d{1,30}$/.test(user.id)) return null
  if (typeof user.username !== 'string' || !user.username.trim() || user.username.length > 80) return null
  const result: DiscordUserProfile = { id: user.id, username: user.username }
  if (typeof user.global_name === 'string' || user.global_name === null) result.global_name = user.global_name
  if (typeof user.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(user.avatar)) result.avatar = user.avatar
  if (user.avatar === null) result.avatar = null
  if (typeof user.discriminator === 'string') result.discriminator = user.discriminator
  return result
}

export async function saveUser(id: string, username: string) {
  await assertPersonalDataAllowed(id)
  const user = await prisma.gm_user.findFirst({
    where: {
      id,
    },
  })

  let saved: { updatedAt: Date }
  if (!user) {
    saved = await prisma.gm_user.create({
      data: {
        id,
        username,
        trust: (await getRetainedTrust(id)) ?? 50,
      },
    })
  } else {
    saved = await prisma.gm_user.update({
      where: {
        id,
      },
      data: {
        username,
      },
    })
  }

  if (await isErasureBlocked(id)) {
    await prisma.gm_user.deleteMany({ where: { id, updatedAt: saved.updatedAt } })
    throw new PersonalDataErasureError()
  }
  return true
}

export async function saveUserPanel(discordID: string, discordUserToken: any, sessionData: any) {
  await prepareExplicitOAuthLogin(discordID)
  await assertPersonalDataAllowed(discordID)
  const savedDiscordToken = await saveDiscordCredentials(discordID, discordUserToken)
  const { token, session } = await createApplicationSession(discordID, sessionData)
  if (await isErasureBlocked(discordID)) {
    await prisma.gm_panelToken.deleteMany({ where: { id: session.id } })
    await prisma.gm_discordToken.deleteMany({
      where: { discordID, version: savedDiscordToken.version, refreshToken: savedDiscordToken.refreshToken },
    })
    throw new PersonalDataErasureError()
  }
  return token
}

export async function addUserToGuild(guildID: string, userID: string, userToken: string) {
  const response = await fetch(`https://discord.com/api/guilds/${guildID}/members/${userID}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${ConfigDiscord.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: userToken,
    }),
  })

  return response.ok
}

export async function getDiscordUserFromID(discordID: string) {
  return await enqueueMainClientFetchUser(discordID)
}

export async function updatePseudoToGmod(member: GuildMember, oldMember: GuildMember, newMember: GuildMember) {
  const servers = await getServersFromDiscordGuildID(member.guild.id)
  if (!servers || servers.length === 0) return

  const user = await getUserFromDiscordID(member.id)
  if (!user || !user.getSteamID64()) return

  for (const server of servers) {
    const pseudoDirection = await server.getEffectiveSetting('sync_pseudo_direction')
    if (pseudoDirection !== 'both' && pseudoDirection !== 'discord-to-gmod') continue

    const redisKey = `sync-pseudo:gmod:server:${server.id}:user:${user.getSteamID64()}`
    const redisData = await redis.get(redisKey)
    // redisData === null means "never synced yet", not "cached value is empty" - without this
    // guard, a member with no nickname (also null) would false-positive match on the first sync
    // and the username fallback would never get pushed.
    if (redisData !== null && (redisData === newMember.nickname || redisData === newMember.user.username)) return

    const pseudo = newMember.nickname || newMember.user.username
    await wsSendToServerQueue.add('wsSendToServer', {
      id: server.getID(),
      data: { method: 'wsSyncName', steamID64: user.getSteamID64(), name: pseudo },
    } as WSSendToServerData)
  }
}

export async function givePremiumRoleOfMainGuild() {
  return await enqueueMainClientSyncPremiumRoles()
}
