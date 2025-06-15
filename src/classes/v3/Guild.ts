import axios from 'axios';
import { discordConfig } from '../../config/index.js';
import redis from '../../services/redis/index.js';
import { getServersFromDiscordGuildID } from './Server.js';
import { getGuildClient, getMainClient, loadGuildBotInstance } from '../../discord/index.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Guild as DiscordGuild,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import index from '../../services/prisma/index.js';
import { User } from './User.js';

const guildSettings: Record<string, any> = {
  verification_dont_mp: {
    defaultValue: false,
    acceptedValues: [true, false],
  },
  bot_status: {
    defaultValue: 'disabled',
    acceptedValues: ['disabled', 'guildMemberCount', 'playerCount', 'rotate'],
  },
};

export class Guild {
  public dscGuild: DiscordGuild;
  public id: string;

  constructor(guild: DiscordGuild) {
    this.dscGuild = guild;
    this.id = guild.id;
  }

  async isPremium() {
    return await isGuildPremium(this.id);
  }

  async getAllSettings() {
    const settings = await index.gm_guild_settings.findMany({
      where: {
        guildID: this.id,
      },
    });

    const data: Record<string, any> = {};
    for (const setting of settings) {
      data[setting.setting] = setting.value;
      if (guildSettings[setting.setting] && guildSettings[setting.setting].acceptedValues) {
        if (
          guildSettings[setting.setting].acceptedValues.includes(true) ||
          guildSettings[setting.setting].acceptedValues.includes(false)
        ) {
          if (setting.value === '0' || setting.value === 'false') data[setting.setting] = false;
          if (setting.value === '1' || setting.value === 'true') data[setting.setting] = true;
        }
      }
    }

    return data;
  }

  async canCheckVerif() {
    const guildInfo = await index.gm_guild.findFirst({
      where: {
        guild: this.id,
      },
    });

    if (guildInfo!.member > 1000) {
      return false;
    }

    const lastCheck = await index.gm_guild_verification_check.findFirst({
      where: {
        guildID: this.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!lastCheck) {
      return true;
    }

    const lastCheckDate = new Date(lastCheck.createdAt);
    const currentDate = new Date();
    const diff = currentDate.getTime() - lastCheckDate.getTime();

    if (diff > 60 * 60 * 24 * 1000) {
      return lastCheck;
    }

    return false;
  }

  async getSetting(setting: string) {
    if (!guildSettings[setting]) {
      throw new Error('Setting not found');
    }

    const redisKey = `server:${this.id}:setting:${setting}`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const result = await index.gm_guild_settings.findFirst({
      where: {
        guildID: this.id,
        setting,
      },
    });

    if (result) {
      let rtnValue: any = result.value;
      if (
        (guildSettings[setting].acceptedValues && guildSettings[setting].acceptedValues.includes(true)) ||
        guildSettings[setting].acceptedValues.includes(false)
      ) {
        if (rtnValue === '0' || rtnValue === 'false') rtnValue = false;
        if (rtnValue === '1' || rtnValue === 'true') rtnValue = true;
      }

      await redis.set(redisKey, JSON.stringify(rtnValue), 'EX', 10);
      return rtnValue;
    }

    return guildSettings[setting].defaultValue;
  }

  async getOrCreateChannelWebhook(channelID: string) {
    const dbWebhook = await index.gm_guild_webooks.findFirst({
      where: {
        guild: this.id,
        channelID,
      },
    });

    const channel = this.dscGuild.channels.cache.get(channelID);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.type !== ChannelType.GuildText) {
      throw new Error('Channel is not a guild text channel');
    }

    if (!dbWebhook) {
      const webhook = await channel.createWebhook({
        name: 'Gmod Integration',
        avatar: discordConfig.gmodIntegrationLogo,
      });

      await index.gm_guild_webooks.create({
        data: {
          guild: this.id,
          channelID,
          webhookID: webhook.id,
          webhookToken: webhook.token,
        },
      });

      return webhook;
    }

    const webhook = await this.dscGuild.client.fetchWebhook(dbWebhook.webhookID, dbWebhook.webhookToken);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    return webhook;
  }

  async setSetting(setting: string, value: any) {
    if (!guildSettings[setting]) {
      throw new Error('Setting not found');
    }

    if (
      !guildSettings.freeValues &&
      guildSettings[setting].acceptedValues &&
      !guildSettings[setting].acceptedValues.includes(value)
    ) {
      throw new Error('Invalid value');
    }

    const result = await index.gm_guild_settings.findFirst({
      where: {
        guildID: this.id,
        setting,
      },
    });

    value = value.toString();

    if (result) {
      await index.gm_guild_settings.update({
        where: {
          guildID_setting: {
            guildID: this.id,
            setting,
          },
        },
        data: {
          value,
        },
      });
    } else {
      await index.gm_guild_settings.create({
        data: {
          guildID: this.id,
          setting,
          value,
        },
      });
    }

    await redis.del(`server:${this.id}:setting:${setting}`);

    return {
      value: await this.getSetting(setting),
    };
  }

  async getServers() {
    return await getServersFromDiscordGuildID(this.id);
  }

  async getCustomBotClient() {
    const botCustomClient = await getGuildClient(this.id, false);
    if (!botCustomClient || !botCustomClient.user) throw new Error('Bot client not found');
    if (botCustomClient.user.id === discordConfig.clientID) throw new Error('Bot client is not custom');
    return botCustomClient;
  }

  async mainBotOnGuild() {
    const mainClient = await getMainClient();
    return mainClient.guilds.cache.has(this.id);
  }

  async getBotRoleSubordination() {
    // Get all the guild roles
    const guildRoles = await this.dscGuild.roles.fetch();
    if (!guildRoles) throw new Error('Guild roles not found');

    let roles: Record<string, { name: string; editable: boolean }> = {};
    guildRoles.forEach((role) => {
      roles[role.id] = {
        name: role.name,
        editable: role.editable,
      };
    });
    return roles;
  }

  async getBotClientInfo(user: User) {
    const botInstance = await getGuildClient(this.id, false);
    if (!botInstance || !botInstance.user) throw new Error('Bot client not found');
    const isCustom = botInstance.user!.id !== discordConfig.clientID;

    const activeGuild = await index.gm_gmodstore_purchases.findFirst({
      where: {
        guild: this.id,
        revoke: false,
      },
    });

    let purchased = false;
    if (user.steamID64) {
      const hasPurchase = await index.gm_gmodstore_purchases.findFirst({
        where: {
          steamID64: user.steamID64,
        },
      });
      purchased = !!hasPurchase;
    }

    let onGuild = false;
    if (isCustom) {
      onGuild = botInstance.guilds.cache.has(this.id);
    }

    let status;
    try {
      status = await this.getSetting('bot_status');
    } catch (error) {
      status = 'disabled';
    }

    return {
      id: botInstance.user.id,
      username: botInstance.user.username,
      avatar: botInstance.user.avatarURL(),
      custom: isCustom,
      token: activeGuild ? activeGuild.token : null,
      active: !!activeGuild,
      purchased: !!purchased,
      onGuild,
      status,
    };
  }

  async reloadBotInstance() {
    await loadGuildBotInstance(this.id);
  }

  async updateBotInstanceToken(newToken: string) {
    const botInstanceData = await index.gm_gmodstore_purchases.findFirst({
      where: {
        guild: this.id,
        revoke: false,
      },
    });

    if (!botInstanceData) throw new Error('Bot client not found');
    await index.gm_gmodstore_purchases.update({
      where: {
        steamID64: botInstanceData.steamID64,
      },
      data: {
        token: newToken,
      },
    });
    await this.reloadBotInstance();
  }

  async updateBotInstanceInfo(data: { username: string; avatar: string; token: string; status: string }) {
    const customBotInstance = await this.getCustomBotClient();
    if (!customBotInstance) throw new Error('Bot client not found');
    if (!customBotInstance.user) throw new Error('Bot client user not found');

    const { username, avatar, status } = data;

    if (username && username !== customBotInstance.user.username) {
      await customBotInstance.user.setUsername(username);
    }

    if (avatar && avatar !== customBotInstance.user.avatarURL()) {
      await customBotInstance.user.setAvatar(avatar);
    }

    if (status) {
      await this.setSetting('bot_status', status);
    }
  }

  async getAdmins() {
    const members = await this.dscGuild.members.fetch();
    return members
      .filter((member) => member.permissions.has('Administrator') && !member.user.bot)
      .map((member) => {
        return {
          id: member.id,
          name: member.displayName,
          avatar: member.user.displayAvatarURL(),
        };
      });
  }

  async getLinks() {
    return index.gm_server_links.findMany({
      where: {
        guild: this.id,
      },
    });
  }

  async getLink(linkID: number | string) {
    if (typeof linkID === 'string') linkID = parseInt(linkID);
    return index.gm_server_links.findFirst({
      where: {
        guild: this.id,
        id: linkID,
      },
    });
  }

  async deleteLink(linkID: number | string) {
    if (typeof linkID === 'string') linkID = parseInt(linkID);
    return index.gm_server_links.delete({
      where: {
        id: linkID,
        guild: this.id,
      },
    });
  }

  async createNewLink() {
    return index.gm_server_links.create({
      data: {
        guild: this.id,
      },
    });
  }

  async getVerificationRoles() {
    return index.gm_guild_verify_role.findMany({
      where: {
        guildID: this.id,
      },
    });
  }

  async getVerificationRole(roleID: string) {
    return index.gm_guild_verify_role.findFirst({
      where: {
        guildID: this.id,
        roleID,
      },
    });
  }

  async createVerificationRole(roleID: string) {
    return index.gm_guild_verify_role.create({
      data: {
        guildID: this.id,
        roleID,
      },
    });
  }
}

export async function getDiscordEntitlements() {
  const redisKey = `discord:entitlements`;

  try {
    let entitlementGuilds: any = await redis.get(redisKey);
    if (entitlementGuilds === null) {
      const response = await axios.get(
        `https://discord.com/api/v10/applications/${discordConfig.clientID}/entitlements`,
        {
          headers: {
            Authorization: `Bot ${discordConfig.botToken}`,
          },
        },
      );
      entitlementGuilds = response.data;
      await redis.set(redisKey, JSON.stringify(entitlementGuilds), 'EX', 60);
    } else {
      entitlementGuilds = JSON.parse(entitlementGuilds);
    }

    return entitlementGuilds;
  } catch (error) {
    console.error('Error getting entitlements:', error);
    return [];
  }
}

export async function isGuildPremium(guildID: string): Promise<boolean> {
  if (
    (await index.gm_guild_premium.findFirst({
      where: {
        guildID,
      },
    })) ||
    (await index.gm_gmodstore_purchases.findFirst({
      where: {
        guild: guildID,
        revoke: false,
      },
    }))
  ) {
    return true;
  }

  const redisKey = `guild:${guildID}:premium`;
  const cachedPremiumStatus = await redis.get(redisKey);
  if (cachedPremiumStatus !== null) {
    return JSON.parse(cachedPremiumStatus);
  }

  const entitlementGuilds = await getDiscordEntitlements();
  const isPremium: boolean = entitlementGuilds.some((entitlement: any) => entitlement.guild_id === guildID);
  await redis.set(redisKey, JSON.stringify(isPremium), 'EX', 60);

  return isPremium;
}

export async function replyNeedPremium(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const components = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(discordConfig.subscriptionSKUID!),
  );
  await interaction.reply({
    components: [components],
    content: 'This interaction requires Gmod Integration Premium! Upgrade now to get access to these features !',
    ephemeral: true,
  });
}

export async function handlePremiumInteraction(interaction: ButtonInteraction) {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (!interaction.guild) return;
  if (interaction.customId !== 'premium') return;
  return replyNeedPremium(interaction);
}

export async function guildSettingExists(setting: string) {
  return !!guildSettings[setting];
}
