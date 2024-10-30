import axios from 'axios';
import { discordConfig } from '../../config/index.js';
import redis from '../../redis/index.js';
import { getServersFromDiscordGuildID } from './Server.js';
import { getGuildClient, getMainClient, loadGuildBotInstance } from '../../discord/index.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Guild as DiscordGuild,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import prisma from '../../prisma.js';
import { User } from './User.js';

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

  async getBotClientInfo(user: User) {
    const botInstance = await getGuildClient(this.id, false);
    if (!botInstance || !botInstance.user) throw new Error('Bot client not found');
    const isCustom = botInstance.user!.id !== discordConfig.clientID;

    const activeGuild = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: this.id,
        revoke: false,
      },
    });

    let purchased = false;
    if (user.steamID64) {
      const hasPurchase = await prisma.gm_gmodstore_purchases.findFirst({
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

  async updateBotInstanceToken(newToken: string) {
    const botInstanceData = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: this.id,
        revoke: false,
      },
    });

    if (!botInstanceData) throw new Error('Bot client not found');
    await prisma.gm_gmodstore_purchases.update({
      where: {
        steamID64: botInstanceData.steamID64,
      },
      data: {
        token: newToken,
      },
    });
    await this.reloadBotInstance();
  }

  async updateBotInstanceInfo(data: { username: string; avatar: string; token: string }) {
    const customBotInstance = await this.getCustomBotClient();
    if (!customBotInstance) throw new Error('Bot client not found');
    if (!customBotInstance.user) throw new Error('Bot client user not found');

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
    return prisma.gm_server_links.findMany({
      where: {
        guild: this.id,
      },
    });
  }

  async getLink(linkID: number | string) {
    if (typeof linkID === 'string') linkID = parseInt(linkID);
    return prisma.gm_server_links.findFirst({
      where: {
        guild: this.id,
        id: linkID,
      },
    });
  }

  async deleteLink(linkID: number | string) {
    if (typeof linkID === 'string') linkID = parseInt(linkID);
    return prisma.gm_server_links.delete({
      where: {
        id: linkID,
        guild: this.id,
      },
    });
  }

  async createNewLink() {
    return prisma.gm_server_links.create({
      data: {
        guild: this.id,
      },
    });
  }

  async getVerificationRoles() {
    return prisma.gm_guild_verify_role.findMany({
      where: {
        guildID: this.id,
      },
    });
  }

  async getVerificationRole(roleID: string) {
    return prisma.gm_guild_verify_role.findFirst({
      where: {
        guildID: this.id,
        roleID,
      },
    });
  }

  async createVerificationRole(roleID: string) {
    return prisma.gm_guild_verify_role.create({
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
    new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId('1301193970021302403'),
  );
  await interaction.reply({
    components: [components],
    content: 'This command requires Gmod Integration Premium! Upgrade now to get access to these features !',
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
