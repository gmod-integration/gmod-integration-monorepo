import axios from 'axios'
import { ConfigDiscord } from '@gmod/config'
import redis from '@gmod/infra-redis'
import { getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild as DiscordGuild,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import prisma from '@gmod/infra-prisma'
import { type User } from '@gmod/domain-user/User.js'
import {
  enqueueDiscordGuildAdmins,
  enqueueDiscordGuildBans,
  enqueueDiscordGuildBotClientInfo,
  enqueueDiscordGuildReloadBotInstance,
  enqueueDiscordGuildSnapshot,
  enqueueDiscordGuildUpdateBotProfile,
  enqueueMainClientHasGuild,
} from '@gmod/infra-bullmq/discordQueueAdapters.js'

const guildSettings: Record<string, any> = {
  verification_dont_mp: {
    defaultValue: false,
    acceptedValues: [true, false],
    premium: true,
  },
  bot_status: {
    defaultValue: 'disabled',
    acceptedValues: ['disabled', 'guildMemberCount', 'playerCount', 'rotate'],
    premium: true,
  },
  verification_dont_join_support: {
    defaultValue: false,
    acceptedValues: [true, false],
    premium: true,
  },
}

export class Guild {
  public dscGuild: DiscordGuild | null
  public id: string

  constructor(guild: DiscordGuild | { id: string }) {
    this.id = guild.id
    this.dscGuild = 'channels' in guild && !!(guild as any).channels?.cache ? (guild as DiscordGuild) : null
  }

  async isPremium() {
    return await isGuildPremium(this.id)
  }

  async getAllSettings() {
    const settings = await prisma.gm_guild_settings.findMany({
      where: {
        guildID: this.id,
      },
    })

    const data: Record<string, any> = {}
    for (const setting of settings) {
      data[setting.setting] = setting.value
      if (guildSettings[setting.setting] && guildSettings[setting.setting].acceptedValues) {
        if (
          guildSettings[setting.setting].acceptedValues.includes(true) ||
          guildSettings[setting.setting].acceptedValues.includes(false)
        ) {
          if (setting.value === '0' || setting.value === 'false') data[setting.setting] = false
          if (setting.value === '1' || setting.value === 'true') data[setting.setting] = true
        }
      }
    }

    return data
  }

  async canCheckVerif() {
    const guildInfo = await prisma.gm_guild.findFirst({
      where: {
        guild: this.id,
      },
    })

    if (guildInfo!.member > 1000) {
      return false
    }

    const lastCheck = await prisma.gm_guild_verification_check.findFirst({
      where: {
        guildID: this.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!lastCheck) {
      return true
    }

    const lastCheckDate = new Date(lastCheck.createdAt)
    const currentDate = new Date()
    const diff = currentDate.getTime() - lastCheckDate.getTime()

    if (diff > 60 * 60 * 24 * 1000) {
      return lastCheck
    }

    return false
  }

  async getSetting(setting: string) {
    if (!guildSettings[setting]) {
      throw new Error('Setting not found')
    }

    const redisKey = `server:${this.id}:setting:${setting}`
    const redisData = await redis.get(redisKey)
    if (redisData) {
      return JSON.parse(redisData)
    }

    const result = await prisma.gm_guild_settings.findFirst({
      where: {
        guildID: this.id,
        setting,
      },
    })

    if (result) {
      let rtnValue: any = result.value
      if (
        (guildSettings[setting].acceptedValues && guildSettings[setting].acceptedValues.includes(true)) ||
        guildSettings[setting].acceptedValues.includes(false)
      ) {
        if (rtnValue === '0' || rtnValue === 'false') rtnValue = false
        if (rtnValue === '1' || rtnValue === 'true') rtnValue = true
      }

      await redis.set(redisKey, JSON.stringify(rtnValue), 'EX', 10)
      return rtnValue
    }

    return guildSettings[setting].defaultValue
  }

  async getOrCreateChannelWebhook(channelID: string) {
    if (!this.dscGuild) {
      throw new Error('Guild runtime unavailable')
    }

    const dbWebhook = await prisma.gm_guild_webooks.findFirst({
      where: {
        guild: this.id,
        channelID,
      },
    })

    const channel = this.dscGuild.channels.cache.get(channelID)
    if (!channel) {
      throw new Error('Channel not found')
    }

    if (channel.type !== ChannelType.GuildText) {
      throw new Error('Channel is not a guild text channel')
    }

    if (!dbWebhook) {
      const webhook = await channel.createWebhook({
        name: 'Gmod Integration',
        avatar: ConfigDiscord.gmodIntegrationLogo,
      })

      await prisma.gm_guild_webooks.create({
        data: {
          guild: this.id,
          channelID,
          webhookID: webhook.id,
          webhookToken: webhook.token,
        },
      })

      return webhook
    }

    const webhook = await this.dscGuild.client.fetchWebhook(dbWebhook.webhookID, dbWebhook.webhookToken)
    if (!webhook) {
      throw new Error('Webhook not found')
    }

    return webhook
  }

  async setSetting(setting: string, value: any) {
    if (!guildSettings[setting]) {
      throw new Error('Setting not found')
    }

    if (guildSettings[setting].premium && !(await this.isPremium())) {
      throw new Error('Premium setting')
    }

    if (
      !guildSettings.freeValues &&
      guildSettings[setting].acceptedValues &&
      !guildSettings[setting].acceptedValues.includes(value)
    ) {
      throw new Error('Invalid value')
    }

    const result = await prisma.gm_guild_settings.findFirst({
      where: {
        guildID: this.id,
        setting,
      },
    })

    value = value.toString()

    if (result) {
      await prisma.gm_guild_settings.update({
        where: {
          guildID_setting: {
            guildID: this.id,
            setting,
          },
        },
        data: {
          value,
        },
      })
    } else {
      await prisma.gm_guild_settings.create({
        data: {
          guildID: this.id,
          setting,
          value,
        },
      })
    }

    await redis.del(`server:${this.id}:setting:${setting}`)

    return {
      value: await this.getSetting(setting),
    }
  }

  async getServers() {
    return await getServersFromDiscordGuildID(this.id)
  }

  async getCustomBotClient() {
    throw new Error('Not available outside discord runtime')
  }

  async mainBotOnGuild() {
    return await enqueueMainClientHasGuild(this.id)
  }

  async getBotRoleSubordination() {
    const snapshot = await enqueueDiscordGuildSnapshot(this.id)
    if (!snapshot) throw new Error('Guild not found')

    const roles: Record<string, { name: string; editable: boolean }> = {}
    snapshot.roles.forEach((role) => {
      roles[role.id] = {
        name: role.name,
        editable: role.editable,
      }
    })
    return roles
  }

  async getBotClientInfo(user: User) {
    const botInfo = await enqueueDiscordGuildBotClientInfo(this.id)
    if (!botInfo) throw new Error('Bot client not found')
    const isCustom = botInfo.custom

    const activeGuild = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: this.id,
        revoke: false,
      },
    })

    let purchased = false
    if (user.steamID64) {
      const hasPurchase = await prisma.gm_gmodstore_purchases.findFirst({
        where: {
          steamID64: user.steamID64,
        },
      })
      purchased = !!hasPurchase
    }

    let status
    try {
      status = await this.getSetting('bot_status')
    } catch (error) {
      status = 'disabled'
    }

    return {
      id: botInfo.id,
      username: botInfo.username,
      avatar: botInfo.avatar,
      custom: isCustom,
      token: activeGuild ? activeGuild.token : null,
      active: !!activeGuild,
      purchased: !!purchased,
      onGuild: botInfo.onGuild,
      status,
    }
  }

  async reloadBotInstance() {
    await enqueueDiscordGuildReloadBotInstance(this.id)
  }

  async updateBotInstanceToken(newToken: string) {
    const botInstanceData = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: this.id,
        revoke: false,
      },
    })

    if (!botInstanceData) throw new Error('Bot client not found')
    await prisma.gm_gmodstore_purchases.update({
      where: {
        steamID64: botInstanceData.steamID64,
      },
      data: {
        token: newToken,
      },
    })
    await this.reloadBotInstance()
  }

  async updateBotInstanceInfo(data: { username: string; avatar: string; token: string; status: string }) {
    const { username, avatar, status } = data
    const updateResult = await enqueueDiscordGuildUpdateBotProfile({ guildID: this.id, username, avatar })
    if (!updateResult.updated) throw new Error(updateResult.error || 'Unable to update bot profile')

    if (status) {
      await this.setSetting('bot_status', status)
    }
  }

  async getAdmins() {
    return await enqueueDiscordGuildAdmins(this.id)
  }

  async getDiscordBans() {
    return await enqueueDiscordGuildBans(this.id)
  }

  async getLinks() {
    return prisma.gm_server_links.findMany({
      where: {
        guild: this.id,
      },
    })
  }

  async getLink(linkID: number | string) {
    if (typeof linkID === 'string') linkID = parseInt(linkID)
    return prisma.gm_server_links.findFirst({
      where: {
        guild: this.id,
        id: linkID,
      },
    })
  }

  async deleteLink(linkID: number | string) {
    if (typeof linkID === 'string') linkID = parseInt(linkID)
    return prisma.gm_server_links.delete({
      where: {
        id: linkID,
        guild: this.id,
      },
    })
  }

  async createNewLink() {
    return prisma.gm_server_links.create({
      data: {
        guild: this.id,
      },
    })
  }

  async getVerificationRoles() {
    return prisma.gm_guild_verify_role.findMany({
      where: {
        guildID: this.id,
      },
    })
  }

  async getVerificationRole(roleID: string) {
    return prisma.gm_guild_verify_role.findFirst({
      where: {
        guildID: this.id,
        roleID,
      },
    })
  }

  async createVerificationRole(roleID: string) {
    return prisma.gm_guild_verify_role.create({
      data: {
        guildID: this.id,
        roleID,
      },
    })
  }
}

export async function getDiscordEntitlements() {
  const redisKey = `discord:entitlements`

  try {
    let entitlementGuilds: any = await redis.get(redisKey)
    if (entitlementGuilds === null) {
      const response = await axios.get(
        `https://discord.com/api/v10/applications/${ConfigDiscord.clientID}/entitlements`,
        {
          headers: {
            Authorization: `Bot ${ConfigDiscord.botToken}`,
          },
        },
      )
      entitlementGuilds = response.data
      await redis.set(redisKey, JSON.stringify(entitlementGuilds), 'EX', 60)
    } else {
      entitlementGuilds = JSON.parse(entitlementGuilds)
    }

    return entitlementGuilds
  } catch (error) {
    console.error('Error getting entitlements:', error)
    return []
  }
}

export async function isGuildPremium(guildID: string): Promise<boolean> {
  if (
    (await prisma.gm_guild_premium.findFirst({
      where: {
        guildID,
      },
    })) ||
    (await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: guildID,
        revoke: false,
      },
    }))
  ) {
    return true
  }

  const redisKey = `guild:${guildID}:premium`
  const cachedPremiumStatus = await redis.get(redisKey)
  if (cachedPremiumStatus !== null) {
    return JSON.parse(cachedPremiumStatus)
  }

  const entitlementGuilds = await getDiscordEntitlements()
  const isPremium: boolean = entitlementGuilds.some((entitlement: any) => entitlement.guild_id === guildID)
  await redis.set(redisKey, JSON.stringify(isPremium), 'EX', 60)

  return isPremium
}

export async function replyNeedPremium(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const components = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(ConfigDiscord.subscriptionSKUID!),
  )
  await interaction.reply({
    components: [components],
    content: 'This interaction requires Gmod Integration Premium! Upgrade now to get access to these features !',
    ephemeral: true,
  })
}

export async function handlePremiumInteraction(interaction: ButtonInteraction) {
  if (!interaction.isButton()) return
  if (interaction.user.bot) return
  if (!interaction.guild) return
  if (interaction.customId !== 'premium') return
  return replyNeedPremium(interaction)
}

export async function guildSettingExists(setting: string) {
  return !!guildSettings[setting]
}
