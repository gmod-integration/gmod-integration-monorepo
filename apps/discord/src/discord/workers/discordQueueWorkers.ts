import { Worker, type Job } from 'bullmq'
import { connection } from '@gmod/infra-bullmq'
import { s3 } from '@gmod/infra-minio'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import {
  type UpdateGuildUserPseudoJob,
  type UpdatePlayerUserGroupJob,
  type UpdateDiscordTeamRoleJob,
  MainClientHasGuildJobSchema,
  MainClientUploadScreenshotJobSchema,
  MainClientFetchUserJobSchema,
  MainClientSyncPremiumRolesJobSchema,
  MainClientSetPresenceJobSchema,
  DiscordGuildSnapshotJobSchema,
  DiscordGuildVerifyUserJobSchema,
  DiscordGuildRunVerificationCheckJobSchema,
  DiscordCreateVerificationMessageJobSchema,
  DiscordDeleteVerificationMessageJobSchema,
  DiscordGuildBotClientInfoJobSchema,
  DiscordGuildReloadBotInstanceJobSchema,
  DiscordGuildUpdateBotProfileJobSchema,
  DiscordGuildSyncBanJobSchema,
  DiscordGuildAdminsJobSchema,
  DiscordGuildSendLogMessageJobSchema,
  type MainClientHasGuildJob,
  type MainClientUploadScreenshotJob,
  type MainClientFetchUserJob,
  type MainClientSyncPremiumRolesJob,
  type MainClientSetPresenceJob,
  type DiscordGuildSnapshotJob,
  type DiscordGuildVerifyUserJob,
  type DiscordGuildRunVerificationCheckJob,
  type DiscordCreateVerificationMessageJob,
  type DiscordDeleteVerificationMessageJob,
  type DiscordGuildBotClientInfoJob,
  type DiscordGuildReloadBotInstanceJob,
  type DiscordGuildUpdateBotProfileJob,
  type DiscordGuildSyncBanJob,
  type DiscordGuildAdminsJob,
  type DiscordGuildSendLogMessageJob,
} from '@gmod/infra-bullmq/schemas.js'
import { gmLog } from '@gmod/core/utils/logger.js'
import prisma from '@gmod/infra-prisma'
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { EmbedBuilder, PermissionsBitField, type ColorResolvable, type Role } from 'discord.js'
import redis from '@gmod/infra-redis'
import { getGuildClient, getMainClient, loadGuildBotInstance } from '../index.js'
import { addAutoRoleToUser, verifyUser } from '@gmod/domain-guild/discordModels.js'
import { getVerificationGuildMessage } from '../utils/messages.js'
import { ConfigDiscord } from '@gmod/config'
import { getDiscordEntitlements } from '@gmod/domain-guild/Guild.js'

async function writeReply(correlationId: string, payload: unknown) {
  await redis.set(`bullmq:reply:${correlationId}`, JSON.stringify(payload), 'EX', 30)
}

/**
 * Worker: synchroniser le pseudo Discord
 */
export const discordUpdatePseudoWorker = new Worker<UpdateGuildUserPseudoJob>(
  'discord-updatePseudo',
  async (job: Job<UpdateGuildUserPseudoJob>) => {
    const { serverID, steamID64, playerName, userGroup, forceName } = job.data

    try {
      gmLog('bullmq-worker', `[updatePseudo] Processing job for ${steamID64} on server ${serverID}`)

      // Fetch server
      const server = await getServerFromID(serverID)
      if (!server) {
        gmLog('bullmq-worker', `[updatePseudo] Server not found: ${serverID}`)
        return
      }

      // Check sync direction
      const pseudoDirection = await server.getSetting('sync_pseudo_direction')
      if (pseudoDirection !== 'both' && pseudoDirection !== 'gmod-to-discord') {
        gmLog('bullmq-worker', `[updatePseudo] Sync disabled for server ${serverID}`)
        return
      }

      // Get pseudo format
      const pseudoFormat = await server.getSetting('pseudoFormat')
      if (!pseudoFormat) {
        gmLog('bullmq-worker', `[updatePseudo] No pseudo format configured for server ${serverID}`)
        return
      }

      // Get role format
      const rolesFormat = await prisma.gm_server_pseudo.findFirst({
        where: {
          serverID,
          role: userGroup,
          enabled: true,
        },
      })

      // Build pseudo
      const newPseudo = pseudoFormat
        .replace(/{plyName}/g, forceName || playerName)
        .replace(/{plySteamID64}/g, steamID64)
        .replace(/{rolePrefix}/g, rolesFormat ? rolesFormat.prefix : '')
        .replace(/{roleName}/g, rolesFormat ? rolesFormat.name : '')

      // Fetch Discord user
      const user = await getUserFromSteamID64(steamID64)
      if (!user || !user.getDiscordID()) {
        gmLog('bullmq-worker', `[updatePseudo] User not found for steamID ${steamID64}`)
        return
      }

      // Fetch bot instance
      const dscClient = await server.getBotInstance()
      if (!dscClient || !dscClient.user) {
        gmLog('bullmq-worker', `[updatePseudo] Bot instance not found for server ${serverID}`)
        return
      }

      // Fetch guild
      const guild = dscClient.guilds.cache.get(server.getGuildID())
      if (!guild) {
        gmLog('bullmq-worker', `[updatePseudo] Guild not found: ${server.getGuildID()}`)
        return
      }

      // Don't change guild owner nickname
      if (guild.ownerId === user.getDiscordID()) {
        gmLog('bullmq-worker', `[updatePseudo] Skipping guild owner ${user.getDiscordID()}`)
        return
      }

      // Fetch member
      const member = await guild.members.fetch(user.getDiscordID()).catch(() => null)
      if (!member) {
        gmLog('bullmq-worker', `[updatePseudo] Member not found: ${user.getDiscordID()}`)
        return
      }

      // Check bot permissions
      const botMember = await guild.members.fetch(dscClient.user.id).catch(() => null)
      if (!botMember) {
        gmLog('bullmq-worker', `[updatePseudo] Bot member not found in guild ${server.getGuildID()}`)
        return
      }

      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        gmLog('bullmq-worker', `[updatePseudo] Bot has no ManageNicknames permission in ${server.getGuildID()}`)
        return
      }

      if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        gmLog('bullmq-worker', `[updatePseudo] Bot role too low to manage ${user.getDiscordID()}`)
        return
      }

      // Set nickname
      await member.setNickname(newPseudo)
      gmLog('bullmq-worker', `[updatePseudo] Set nickname for ${user.getDiscordID()} to ${newPseudo}`)

      // Cache result
      const redisKey = `sync-pseudo:gmod:server:${serverID}:user:${steamID64}`
      await redis.set(redisKey, newPseudo, 'EX', 120)
    } catch (error) {
      gmLog('bullmq-worker', `[updatePseudo] Error: ${(error as Error).message}`)
      throw error
    }
  },
  { connection, concurrency: 2 },
)

/**
 * Worker: synchroniser le groupe/rôle Discord
 */
export const discordUpdateGroupWorker = new Worker<UpdatePlayerUserGroupJob>(
  'discord-updateGroup',
  async (job: Job<UpdatePlayerUserGroupJob>) => {
    const { serverID, steamID64, userGroup } = job.data

    try {
      gmLog('bullmq-worker', `[updateGroup] Processing job for ${steamID64} on server ${serverID}`)

      // Fetch server
      const server = await getServerFromID(serverID)
      if (!server) {
        gmLog('bullmq-worker', `[updateGroup] Server not found: ${serverID}`)
        return
      }

      // Update DB
      const player = await prisma.gm_server_stat.findFirst({
        where: {
          steam_id: steamID64,
          server_id: serverID,
        },
      })

      if (player) {
        await prisma.gm_server_stat.update({
          where: {
            server_id_steam_id: {
              steam_id: steamID64,
              server_id: serverID,
            },
          },
          data: {
            rank: userGroup,
          },
        })
        gmLog('bullmq-worker', `[updateGroup] Updated DB for ${steamID64} to group ${userGroup}`)
      }

      // Sync roles to Discord (if applicable)
      const syncRoles = await server.getSyncRoles()
      if (syncRoles && syncRoles.length > 0) {
        const user = await getUserFromSteamID64(steamID64)
        if (user && user.getDiscordID()) {
          const dscClient = await server.getBotInstance()
          if (dscClient && dscClient.user) {
            const guild = dscClient.guilds.cache.get(server.getGuildID())
            if (guild) {
              const member = await guild.members.fetch(user.getDiscordID()).catch(() => null)
              if (member) {
                // Find roles for this group
                const groupRoles = syncRoles.filter((r: (typeof syncRoles)[0]) => r.userGroup === userGroup && r.enable)
                const botMember = await guild.members.fetch(dscClient.user.id).catch(() => null)

                if (botMember) {
                  // Remove all existing sync roles
                  const currentSyncRoles = member.roles.cache.filter((r: Role) =>
                    syncRoles.some((sr) => sr.roleID === r.id),
                  )

                  if (currentSyncRoles.size > 0) {
                    await member.roles.remove(Array.from(currentSyncRoles.keys()))
                    gmLog(
                      'bullmq-worker',
                      `[updateGroup] Removed ${currentSyncRoles.size} roles from ${user.getDiscordID()}`,
                    )
                  }

                  // Add new roles
                  for (const groupRole of groupRoles) {
                    const role = guild.roles.cache.get(groupRole.roleID)
                    if (role && botMember.roles.highest.comparePositionTo(role) > 0) {
                      await member.roles.add(groupRole.roleID)
                      gmLog('bullmq-worker', `[updateGroup] Added role ${groupRole.roleID} to ${user.getDiscordID()}`)
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      gmLog('bullmq-worker', `[updateGroup] Error: ${(error as Error).message}`)
      throw error
    }
  },
  { connection, concurrency: 2 },
)

/**
 * Worker: synchroniser le team role Discord
 */
export const discordUpdateTeamRoleWorker = new Worker<UpdateDiscordTeamRoleJob>(
  'discord-updateTeamRole',
  async (job: Job<UpdateDiscordTeamRoleJob>) => {
    const { serverID, steamID64, teamName } = job.data

    try {
      gmLog('bullmq-worker', `[updateTeamRole] Processing job for ${steamID64} on server ${serverID}`)

      // Fetch server
      const server = await getServerFromID(serverID)
      if (!server) {
        gmLog('bullmq-worker', `[updateTeamRole] Server not found: ${serverID}`)
        return
      }

      // Fetch user
      const user = await getUserFromSteamID64(steamID64)
      if (!user) {
        gmLog('bullmq-worker', `[updateTeamRole] User not found for steamID ${steamID64}`)
        return
      }

      // Fetch bot instance
      const dscClient = await server.getBotInstance()
      if (!dscClient || !dscClient.user) {
        gmLog('bullmq-worker', `[updateTeamRole] Bot instance not found for server ${serverID}`)
        return
      }

      // Fetch guild
      const guild = await server.getDiscordGuild()
      if (!guild) {
        gmLog('bullmq-worker', `[updateTeamRole] Guild not found: ${server.getGuildID()}`)
        return
      }

      // Fetch member
      const member = await guild.members.fetch(user.getDiscordID()).catch(() => null)
      if (!member) {
        gmLog('bullmq-worker', `[updateTeamRole] Member not found: ${user.getDiscordID()}`)
        return
      }

      // Get sync team roles
      const syncRoles = await server.getSyncTeamRoles()
      if (!syncRoles || syncRoles.length === 0) {
        gmLog('bullmq-worker', `[updateTeamRole] No team roles configured for server ${serverID}`)
        return
      }

      // Find roles for this team
      const teamRoles = syncRoles.filter((role: (typeof syncRoles)[0]) => role.teamName === teamName && role.enable)

      // Check bot permissions
      const botMember = guild.members.cache.get(dscClient.user.id)
      if (!botMember) {
        gmLog('bullmq-worker', `[updateTeamRole] Bot member not found in guild ${server.getGuildID()}`)
        return
      }

      const botRole = botMember.roles.highest
      if (!botRole) {
        gmLog('bullmq-worker', `[updateTeamRole] Bot has no roles in guild ${server.getGuildID()}`)
        return
      }

      // Filter out roles the bot can't assign
      const assignableRoles = teamRoles.filter((tr: (typeof teamRoles)[0]) => {
        const role = guild.roles.cache.get(tr.roleID)
        return role && botRole.comparePositionTo(role) > 0
      })

      // Find roles to remove
      const rolesToRemove = member.roles.cache.filter(
        (role: Role) =>
          syncRoles.some((syncRole) => syncRole.roleID === role.id) &&
          !assignableRoles.some((ar) => ar.roleID === role.id),
      )

      if (rolesToRemove.size > 0) {
        await member.roles.remove(Array.from(rolesToRemove.keys()))
        gmLog('bullmq-worker', `[updateTeamRole] Removed ${rolesToRemove.size} roles from ${member.user.tag}`)
      }

      // Add new roles
      for (const teamRole of assignableRoles) {
        if (!member.roles.cache.has(teamRole.roleID)) {
          await member.roles.add(teamRole.roleID)
          gmLog('bullmq-worker', `[updateTeamRole] Added role to ${member.user.tag}: ${teamRole.roleID}`)
        }
      }
    } catch (error) {
      gmLog('bullmq-worker', `[updateTeamRole] Error: ${(error as Error).message}`)
      throw error
    }
  },
  { connection, concurrency: 2 },
)

export const discordMainClientOpsWorker = new Worker<
  | MainClientHasGuildJob
  | MainClientUploadScreenshotJob
  | MainClientFetchUserJob
  | MainClientSyncPremiumRolesJob
  | MainClientSetPresenceJob
>(
  'discord-mainClientOps',
  async (
    job: Job<
      | MainClientHasGuildJob
      | MainClientUploadScreenshotJob
      | MainClientFetchUserJob
      | MainClientSyncPremiumRolesJob
      | MainClientSetPresenceJob
    >,
  ) => {
    if (job.name === 'mainClientHasGuild') {
      const payload = MainClientHasGuildJobSchema.parse(job.data)
      const mainClient = await getMainClient()
      const hasGuild = mainClient.guilds.cache.has(payload.guildID)

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, hasGuild })
      return
    }

    if (job.name === 'mainClientUploadScreenshot') {
      const payload = MainClientUploadScreenshotJobSchema.parse(job.data)
      let discordUrl = ''

      try {
        // Fetch file from Minio
        const s3Response = await s3.send(
          new GetObjectCommand({
            Bucket: 'gmi-players-screenshots',
            Key: payload.minioKey,
          }),
        )

        if (!s3Response.Body) {
          throw new Error('No file content from Minio')
        }

        // Convert stream to buffer
        const chunks: Uint8Array[] = []
        const reader = s3Response.Body as AsyncIterable<Uint8Array>
        for await (const chunk of reader) {
          chunks.push(chunk)
        }
        const fileBuffer = Buffer.concat(chunks)

        // Upload to Discord
        const mainClient = await getMainClient()
        const channel = await mainClient.channels.fetch(payload.channelID)
        if (channel && channel.isSendable()) {
          const message = await channel.send({
            content: payload.content,
            files: [
              {
                attachment: fileBuffer,
                name: payload.fileName,
              },
            ],
          })
          discordUrl = message.attachments.first()?.url || ''
        }
      } catch (error) {
        gmLog('bullmq-worker', `[mainClientUploadScreenshot] Error: ${(error as Error).message}`)
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, discordUrl })
      return
    }

    if (job.name === 'mainClientFetchUser') {
      const payload = MainClientFetchUserJobSchema.parse(job.data)
      const mainClient = await getMainClient()
      const user = await mainClient.users.fetch(payload.discordID).catch(() => null)

      await writeReply(payload.correlationId, {
        correlationId: payload.correlationId,
        user: user
          ? {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarURL: user.displayAvatarURL(),
            }
          : null,
      })
    }

    if (job.name === 'mainClientSyncPremiumRoles') {
      const payload = MainClientSyncPremiumRolesJobSchema.parse(job.data)
      let synced = false

      try {
        const mainClient = await getMainClient()
        const guild = mainClient.guilds.cache.get(ConfigDiscord.guildID!)
        if (!guild) {
          await writeReply(payload.correlationId, { correlationId: payload.correlationId, synced: false })
          return
        }

        const gmodStoreBuyers = await prisma.gm_gmodstore_purchases.findMany()
        const dscEntitlements = await getDiscordEntitlements()

        const subscriptionBuyers: string[] = []
        for (const entitlement of dscEntitlements) {
          if (entitlement.user_id && !subscriptionBuyers.includes(entitlement.user_id)) {
            subscriptionBuyers.push(entitlement.user_id)
          }
        }

        if (
          !ConfigDiscord.premiumRoleID ||
          !ConfigDiscord.gmodStorePremiumRoleID ||
          !ConfigDiscord.discordPremiumRoleID
        ) {
          await writeReply(payload.correlationId, { correlationId: payload.correlationId, synced: false })
          return
        }

        const premiumRole = guild.roles.cache.get(ConfigDiscord.premiumRoleID)
        const gmodStorePremiumRole = guild.roles.cache.get(ConfigDiscord.gmodStorePremiumRoleID)
        const discordPremiumRole = guild.roles.cache.get(ConfigDiscord.discordPremiumRoleID)
        if (!premiumRole || !gmodStorePremiumRole || !discordPremiumRole) {
          await writeReply(payload.correlationId, { correlationId: payload.correlationId, synced: false })
          return
        }

        for (const member of premiumRole.members.values()) {
          const user = await prisma.gm_user.findFirst({ where: { id: member.id } })
          if (
            !subscriptionBuyers.includes(member.id) &&
            (!user || !user.steam || !gmodStoreBuyers.find((buyer) => buyer.steamID64 === user.steam))
          ) {
            await member.roles.remove(premiumRole).catch(() => null)
          }
        }

        for (const member of gmodStorePremiumRole.members.values()) {
          const user = await prisma.gm_user.findFirst({ where: { id: member.id } })
          if (!user || !user.steam || !gmodStoreBuyers.find((buyer) => buyer.steamID64 === user.steam)) {
            await member.roles.remove(gmodStorePremiumRole).catch(() => null)
          }
        }

        for (const member of discordPremiumRole.members.values()) {
          if (!subscriptionBuyers.includes(member.id)) {
            await member.roles.remove(discordPremiumRole).catch(() => null)
          }
        }

        for (const buyer of gmodStoreBuyers) {
          const user = await getUserFromSteamID64(buyer.steamID64)
          if (!user) continue

          const member = await guild.members.fetch(user.getDiscordID()).catch(() => null)
          if (!member) continue

          if (!member.roles.cache.has(ConfigDiscord.premiumRoleID)) {
            await member.roles.add(premiumRole).catch(() => null)
          }

          if (!member.roles.cache.has(ConfigDiscord.gmodStorePremiumRoleID)) {
            await member.roles.add(gmodStorePremiumRole).catch(() => null)
          }
        }

        for (const buyer of subscriptionBuyers) {
          const member = await guild.members.fetch(buyer).catch(() => null)
          if (!member) continue

          if (!member.roles.cache.has(ConfigDiscord.premiumRoleID)) {
            await member.roles.add(premiumRole).catch(() => null)
          }

          if (!member.roles.cache.has(ConfigDiscord.discordPremiumRoleID)) {
            await member.roles.add(discordPremiumRole).catch(() => null)
          }
        }

        synced = true
      } catch (error) {
        synced = false
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, synced })
      return
    }

    if (job.name === 'mainClientSetPresence') {
      const payload = MainClientSetPresenceJobSchema.parse(job.data)
      let updated = false
      try {
        const mainClient = await getMainClient()
        if (mainClient.user) {
          mainClient.user.setPresence({
            activities: [
              {
                name: payload.activityName,
                type: payload.activityType ?? 3,
              },
            ],
          })
          updated = true
        }
      } catch (error) {
        updated = false
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, updated })
    }
  },
  { connection, concurrency: 2 },
)

export const discordGuildOpsWorker = new Worker<
  | DiscordGuildSnapshotJob
  | DiscordGuildVerifyUserJob
  | DiscordGuildRunVerificationCheckJob
  | DiscordCreateVerificationMessageJob
  | DiscordDeleteVerificationMessageJob
  | DiscordGuildBotClientInfoJob
  | DiscordGuildReloadBotInstanceJob
  | DiscordGuildUpdateBotProfileJob
  | DiscordGuildSyncBanJob
  | DiscordGuildAdminsJob
  | DiscordGuildSendLogMessageJob
>(
  'discord-guildOps',
  async (
    job: Job<
      | DiscordGuildSnapshotJob
      | DiscordGuildVerifyUserJob
      | DiscordGuildRunVerificationCheckJob
      | DiscordCreateVerificationMessageJob
      | DiscordDeleteVerificationMessageJob
      | DiscordGuildBotClientInfoJob
      | DiscordGuildReloadBotInstanceJob
      | DiscordGuildUpdateBotProfileJob
      | DiscordGuildSyncBanJob
      | DiscordGuildAdminsJob
      | DiscordGuildSendLogMessageJob
    >,
  ) => {
    if (job.name === 'guildSnapshot') {
      const payload = DiscordGuildSnapshotJobSchema.parse(job.data)
      const client = await getGuildClient(payload.guildID, false)
      const guild = await client.guilds.fetch(payload.guildID).catch(() => null)
      if (!guild) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, guild: null })
        return
      }

      await guild.channels.fetch().catch(() => null)
      await guild.roles.fetch().catch(() => null)
      await guild.emojis.fetch().catch(() => null)

      await writeReply(payload.correlationId, {
        correlationId: payload.correlationId,
        guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          ownerID: guild.ownerId,
          preferredLocale: guild.preferredLocale,
          channels: guild.channels.cache.map((channel) => ({
            id: channel.id,
            name: channel.name,
            type: String(channel.type),
            position: 'position' in channel ? channel.position : null,
            parentID: channel.parent ? channel.parent.id : null,
            sendable: channel.isSendable(),
            textBased: channel.isTextBased(),
          })),
          roles: guild.roles.cache.map((role) => ({
            id: role.id,
            name: role.name,
            position: role.position,
            color: role.color,
            colorHex: `#${role.color.toString(16).padStart(6, '0')}`,
            managed: role.managed,
            editable: role.editable,
          })),
          emojis: guild.emojis.cache.map((emoji) => ({
            id: emoji.id,
            name: emoji.name,
            url: emoji.url,
          })),
        },
      })
      return
    }

    if (job.name === 'guildVerifyUser') {
      const payload = DiscordGuildVerifyUserJobSchema.parse(job.data)
      const client = await getGuildClient(payload.guildID, false)
      const guild = await client.guilds.fetch(payload.guildID).catch(() => null)
      if (!guild) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, verified: false })
        return
      }

      const member = await guild.members.fetch(payload.userID).catch(() => null)
      const verified = member ? await verifyUser(guild, member) : false
      await writeReply(payload.correlationId, { correlationId: payload.correlationId, verified: !!verified })
      return
    }

    if (job.name === 'guildRunVerificationCheck') {
      const payload = DiscordGuildRunVerificationCheckJobSchema.parse(job.data)
      const client = await getGuildClient(payload.guildID, false)
      const guild = await client.guilds.fetch(payload.guildID).catch(() => null)
      if (!guild) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, processed: 0 })
        return
      }

      const members = await guild.members.fetch().catch(() => null)
      let processed = 0
      if (members) {
        for (const member of members.values()) {
          await addAutoRoleToUser(guild, member)
          await verifyUser(guild, member)
          processed += 1
        }
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, processed })
      return
    }

    if (job.name === 'createVerificationMessage') {
      const payload = DiscordCreateVerificationMessageJobSchema.parse(job.data)
      try {
        const client = await getGuildClient(payload.guildID, false)
        const guild = await client.guilds.fetch(payload.guildID)
        const channel = guild.channels.cache.get(payload.channelID) ?? (await guild.channels.fetch(payload.channelID))
        if (!channel || !channel.isSendable()) {
          await writeReply(payload.correlationId, {
            correlationId: payload.correlationId,
            verifyMessage: null,
            error: 'Channel is not sendable',
          })
          return
        }

        const oldMsg = await prisma.gm_guild_verify_msg.findFirst({
          where: {
            guildID: guild.id,
          },
        })

        if (oldMsg) {
          const oldChannel = guild.channels.cache.get(oldMsg.channelID)
          if (oldChannel && oldChannel.isTextBased()) {
            const oldMessage = await oldChannel.messages.fetch(oldMsg.messageID).catch(() => null)
            if (oldMessage) {
              await oldMessage.delete().catch(() => null)
            }
          }
          await prisma.gm_guild_verify_msg.delete({
            where: {
              guildID: guild.id,
            },
          })
        }

        const verificationMessage = await getVerificationGuildMessage(guild.preferredLocale, guild.id)
        const sent = await channel.send(verificationMessage)

        const created = await prisma.gm_guild_verify_msg.create({
          data: {
            guildID: guild.id,
            messageID: sent.id,
            channelID: payload.channelID,
          },
        })

        await writeReply(payload.correlationId, {
          correlationId: payload.correlationId,
          verifyMessage: {
            guildID: created.guildID,
            channelID: created.channelID,
            messageID: created.messageID,
          },
        })
      } catch (error) {
        await writeReply(payload.correlationId, {
          correlationId: payload.correlationId,
          verifyMessage: null,
          error: (error as Error).message,
        })
      }
      return
    }

    if (job.name === 'deleteVerificationMessage') {
      const payload = DiscordDeleteVerificationMessageJobSchema.parse(job.data)

      const client = await getGuildClient(payload.guildID, false)
      const guild = await client.guilds.fetch(payload.guildID).catch(() => null)
      if (!guild) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, deleted: false })
        return
      }

      const channel = guild.channels.cache.get(payload.channelID) ?? (await guild.channels.fetch(payload.channelID))
      if (channel && channel.isTextBased()) {
        const message = await channel.messages.fetch(payload.messageID).catch(() => null)
        if (message) {
          await message.delete().catch(() => null)
        }
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, deleted: true })
      return
    }

    if (job.name === 'guildBotClientInfo') {
      const payload = DiscordGuildBotClientInfoJobSchema.parse(job.data)
      const botInstance = await getGuildClient(payload.guildID, false).catch(() => null)
      if (!botInstance || !botInstance.user) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, botInfo: null })
        return
      }

      const isCustom = botInstance.user.id !== ConfigDiscord.clientID
      const onGuild = isCustom ? botInstance.guilds.cache.has(payload.guildID) : false

      await writeReply(payload.correlationId, {
        correlationId: payload.correlationId,
        botInfo: {
          id: botInstance.user.id,
          username: botInstance.user.username,
          avatar: botInstance.user.avatarURL(),
          custom: isCustom,
          onGuild,
        },
      })
      return
    }

    if (job.name === 'guildReloadBotInstance') {
      const payload = DiscordGuildReloadBotInstanceJobSchema.parse(job.data)
      let reloaded = true
      try {
        await loadGuildBotInstance(payload.guildID)
      } catch (error) {
        reloaded = false
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, reloaded })
      return
    }

    if (job.name === 'guildUpdateBotProfile') {
      const payload = DiscordGuildUpdateBotProfileJobSchema.parse(job.data)
      try {
        const botInstance = await getGuildClient(payload.guildID, false)
        if (!botInstance.user) {
          await writeReply(payload.correlationId, {
            correlationId: payload.correlationId,
            updated: false,
            error: 'Bot client user not found',
          })
          return
        }

        if (botInstance.user.id === ConfigDiscord.clientID) {
          await writeReply(payload.correlationId, {
            correlationId: payload.correlationId,
            updated: false,
            error: 'Bot client is not custom',
          })
          return
        }

        if (payload.username && payload.username !== botInstance.user.username) {
          await botInstance.user.setUsername(payload.username)
        }

        if (payload.avatar && payload.avatar !== botInstance.user.avatarURL()) {
          await botInstance.user.setAvatar(payload.avatar)
        }

        await writeReply(payload.correlationId, { correlationId: payload.correlationId, updated: true })
      } catch (error) {
        await writeReply(payload.correlationId, {
          correlationId: payload.correlationId,
          updated: false,
          error: (error as Error).message,
        })
      }
      return
    }

    if (job.name === 'guildSyncBan') {
      const payload = DiscordGuildSyncBanJobSchema.parse(job.data)
      let synced = false
      try {
        const client = await getGuildClient(payload.guildID)
        const guild = client.guilds.cache.get(payload.guildID)
        if (!guild) {
          await writeReply(payload.correlationId, { correlationId: payload.correlationId, synced: false })
          return
        }

        let banReason = 'No Reason'
        for (const oldDiscordID of payload.oldDiscordIDs) {
          const ban = await guild.bans.fetch(oldDiscordID).catch(() => null)
          if (ban) {
            banReason = ban.reason || banReason
            break
          }
        }

        for (const oldDiscordID of payload.oldDiscordIDs) {
          await guild.members.ban(oldDiscordID, {
            reason: `Gmod Integration - Sync Ban : ${banReason}`,
          })
        }

        await guild.members.ban(payload.newDiscordID, {
          reason: `Gmod Integration - Sync Ban : ${banReason}`,
        })
        synced = true
      } catch (error) {
        synced = false
      }

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, synced })
      return
    }

    if (job.name === 'guildAdmins') {
      const payload = DiscordGuildAdminsJobSchema.parse(job.data)
      const client = await getGuildClient(payload.guildID, false)
      const guild = await client.guilds.fetch(payload.guildID).catch(() => null)
      if (!guild) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, admins: [] })
        return
      }

      const members = await guild.members.fetch().catch(() => null)
      if (!members) {
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, admins: [] })
        return
      }

      const admins = members
        .filter((member) => member.permissions.has('Administrator') && !member.user.bot)
        .map((member) => ({
          id: member.id,
          name: member.displayName,
          avatar: member.user.displayAvatarURL(),
        }))

      await writeReply(payload.correlationId, { correlationId: payload.correlationId, admins })
      return
    }

    if (job.name === 'guildSendLogMessage') {
      const payload = DiscordGuildSendLogMessageJobSchema.parse(job.data)
      try {
        const client = await getGuildClient(payload.guildID, false)
        const guild = await client.guilds.fetch(payload.guildID).catch(() => null)
        if (!guild) {
          await writeReply(payload.correlationId, {
            correlationId: payload.correlationId,
            sent: false,
            error: 'Guild not found',
          })
          return
        }

        const channel = guild.channels.cache.get(payload.channelID) ?? (await guild.channels.fetch(payload.channelID))
        if (!channel || !channel.isSendable()) {
          await writeReply(payload.correlationId, {
            correlationId: payload.correlationId,
            sent: false,
            error: 'Channel is not sendable',
          })
          return
        }

        const embed = new EmbedBuilder()
          .setColor(payload.color as ColorResolvable)
          .setTitle(payload.title)
          .setDescription(payload.description ?? null)
          .setFooter({ text: payload.footer })
          .setTimestamp()

        await channel.send({ embeds: [embed] })
        await writeReply(payload.correlationId, { correlationId: payload.correlationId, sent: true })
      } catch (error) {
        await writeReply(payload.correlationId, {
          correlationId: payload.correlationId,
          sent: false,
          error: (error as Error).message,
        })
      }
    }
  },
  { connection, concurrency: 2 },
)

/**
 * Initialize all Discord queue workers
 */
export async function initializeDiscordQueueWorkers() {
  gmLog('bullmq', 'Initializing Discord queue workers...')

  discordUpdatePseudoWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[updatePseudo] Job completed: ${job.id}`)
  })

  discordUpdatePseudoWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[updatePseudo] Job failed: ${job?.id} - ${err.message}`)
  })

  discordUpdateGroupWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[updateGroup] Job completed: ${job.id}`)
  })

  discordUpdateGroupWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[updateGroup] Job failed: ${job?.id} - ${err.message}`)
  })

  discordUpdateTeamRoleWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[updateTeamRole] Job completed: ${job.id}`)
  })

  discordUpdateTeamRoleWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[updateTeamRole] Job failed: ${job?.id} - ${err.message}`)
  })

  discordMainClientOpsWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[mainClientOps] Job completed: ${job.id}`)
  })

  discordMainClientOpsWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[mainClientOps] Job failed: ${job?.id} - ${err.message}`)
  })

  discordGuildOpsWorker.on('completed', (job) => {
    gmLog('bullmq-worker', `[guildOps] Job completed: ${job.id}`)
  })

  discordGuildOpsWorker.on('failed', (job, err) => {
    gmLog('bullmq-worker', `[guildOps] Job failed: ${job?.id} - ${err.message}`)
  })

  gmLog('bullmq', 'Discord queue workers initialized')
}
