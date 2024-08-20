import axios from 'axios';
import { discordConfig, serverConfig } from '../../config/index.js';
import redis from '../../redis/index.js';
import { getServersFromDiscordGuildID } from './Server.js';
import ServerLinks from '../../database/schema/ServerLinks.js';
import gm_guild_verify_role from '../../database/schema/gm_guild_verify_role.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';
import PremiumGuild from '../../database/schema/PremiumGuild.js';
import { getGuildClient, loadGuildBotInstance } from '../../discord/index.js';
import { ActivityType } from 'discord.js';

export class Guild {
  constructor(guild) {
    this.dscGuild = guild;
    this.id = guild.id;
  }

  async isPremium() {
    return await isGuildPremium(this.id);
  }

  async getServers() {
    return await getServersFromDiscordGuildID(this.id);
  }

  async getCustomBotClient() {
    const botCustomClient = await getGuildClient(this.id, false);
    if (botCustomClient.user.id === discordConfig.clientID) {
      return new Error('Blocked access to main client');
    }

    return botCustomClient;
  }

  async getBotClientInfo(user) {
    const botInstance = await getGuildClient(this.id, false);
    const isCustom = botInstance.user.id !== discordConfig.clientID;

    const activeGuild = await GmodStorePurchases.findOne({
      where: {
        guild: this.id,
        revoke: false,
      },
    });

    const purchased = await GmodStorePurchases.findOne({
      where: {
        steamID64: user.steamID64,
      },
    });

    let onGuild = false;
    if (isCustom) {
      onGuild = botInstance.guilds.cache.has(this.id);
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
    };
  }

  async reloadBotInstance() {
    await loadGuildBotInstance(this.id);
  }

  async updateBotInstanceToken(newToken) {
    const botInstanceData = await GmodStorePurchases.findOne({
      where: {
        guild: this.id,
        revoke: false,
      },
    });

    if (!botInstanceData) new Error('Bot client not found');

    botInstanceData.token = newToken;
    await botInstanceData.save();
    await this.reloadBotInstance();
  }

  async updateBotInstanceInfo(data) {
    const customBotInstance = await this.getCustomBotClient();

    const { username, avatar } = data;

    if (username && username !== customBotInstance.user.username) {
      await customBotInstance.user.setUsername(username);
    }

    if (avatar && avatar !== customBotInstance.user.avatarURL()) {
      await customBotInstance.user.setAvatar(avatar);
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
    return await ServerLinks.findAll({
      where: {
        guild: this.id,
      },
    });
  }

  async getLink(linkID) {
    return await ServerLinks.findOne({
      where: {
        guild: this.id,
        id: linkID,
      },
    });
  }

  async createNewLink() {
    return await ServerLinks.create({
      guild: this.id,
    });
  }

  async getVerificationRoles() {
    return await gm_guild_verify_role.findAll({
      where: {
        guildID: this.id,
      },
    });
  }

  async getVerificationRole(roleID) {
    return await gm_guild_verify_role.findOne({
      where: {
        guildID: this.id,
        roleID,
      },
    });
  }

  async createVerificationRole(roleID) {
    return await gm_guild_verify_role.create({
      guildID: this.id,
      roleID,
    });
  }
}

export async function isGuildPremium(guildID) {
  if (
    (await PremiumGuild.findOne({
      where: {
        guildID,
      },
    })) ||
    (await GmodStorePurchases.findOne({
      where: {
        guild: guildID,
        revoke: false,
      },
    }))
  ) {
    return true;
  }

  const redisKey = `guild:${guildID}:premium`;
  const redisKey2 = `discord:entitlements`;

  try {
    const cachedPremiumStatus = await redis.get(redisKey);
    if (cachedPremiumStatus !== null) {
      return JSON.parse(cachedPremiumStatus);
    }

    let entitlementGuilds = await redis.get(redisKey2);
    if (serverConfig.production !== 'false') {
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
        await redis.set(redisKey2, JSON.stringify(entitlementGuilds), 'EX', 60);
      } else {
        entitlementGuilds = JSON.parse(entitlementGuilds);
      }
    } else {
      entitlementGuilds = [];
    }

    let isPremium = entitlementGuilds.some((entitlement) => entitlement.guild_id === guildID);
    await redis.set(redisKey, JSON.stringify(isPremium), 'EX', 60); // Cache the result

    return isPremium;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

export async function replyNeedPremium(interaction) {
  if (serverConfig.production === 'false') {
    return interaction.reply({
      content: 'This feature is only available to premium servers.',
      ephemeral: true,
    });
  }

  const url = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`;
  const json = {
    type: 10,
    data: {},
  };

  await axios
    .post(url, json, {
      headers: {
        Authorization: `Bot ${discordConfig.botToken}`,
        'Content-Type': 'application/json',
      },
    })
    .catch((err) => {
      console.error(err);
    });
}

export async function handlePremiumInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (!interaction.guild) return;
  if (interaction.customId !== 'premium') return;
  return replyNeedPremium(interaction);
}
