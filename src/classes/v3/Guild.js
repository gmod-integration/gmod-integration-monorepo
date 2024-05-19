import axios from 'axios';
import { discordConfig } from '../../config/index.js';
import redis from '../../redis/index.js';
import { getServersFromDiscordGuildID } from './Server.js';
import gm_link from '../../database/schema/gm_link.js';
import gm_guild_verify_role from '../../database/schema/gm_guild_verify_role.js';

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
    return await gm_link.findAll({
      where: {
        guild: this.id,
      },
    });
  }

  async getLink(linkID) {
    return await gm_link.findOne({
      where: {
        guild: this.id,
        id: linkID,
      },
    });
  }

  async createNewLink() {
    return await gm_link.create({
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
  if (discordConfig.premiumGuilds.includes(guildID)) {
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

    let isPremium = entitlementGuilds.some((entitlement) => entitlement.guild_id === guildID);
    await redis.set(redisKey, JSON.stringify(isPremium), 'EX', 60); // Cache the result

    return isPremium;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

export async function replyNeedPremium(interaction) {
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
