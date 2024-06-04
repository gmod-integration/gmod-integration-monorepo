import { getUserFromDiscordID } from './User.js';
import { getUserGuildsWithPermsForPanel } from '../../models/v3/discordModels.js';
import redis from '../../redis/index.js';
import gm_panelToken from '../../database/schema/gm_panelToken.js';
import gm_discordToken from '../../database/schema/gm_discordToken.js';

export class PanelUser {
  constructor(obj = {}) {
    this.user = obj.user;
    this.discordID = obj.discordID;
    this.panelToken = {
      token: obj.panelToken.token,
      creationDate: obj.panelToken.creationDate,
      expirationDate: obj.panelToken.expirationDate,
    };
    this.discordToken = {
      token: obj.discordToken.token,
      refreshToken: obj.discordToken.refreshToken,
      creationDate: obj.discordToken.creationDate,
      expirationDate: obj.discordToken.expirationDate,
    };
  }

  hasExpired() {
    return this.discordToken.expirationDate < Date.now() && this.panelToken.expirationDate < Date.now();
  }

  getDiscordToken() {
    return this.discordToken.token;
  }

  isValidPanelToken(token) {
    return token === this.panelToken.token;
  }

  authAllowed(token) {
    return this.isValidPanelToken(token) && !this.hasExpired();
  }

  async findGuilds() {
    const redisKey = `user:${this.discordID}:guilds`;
    const cachedUserGuilds = await redis.get(redisKey);
    if (cachedUserGuilds !== null) {
      return JSON.parse(cachedUserGuilds);
    }

    const redisKey2 = `user:${this.discordID}:isWaitingGuilds`;
    const isWaitingGuilds = await redis.get(redisKey2);

    if (isWaitingGuilds) {
      await new Promise((resolve) => {
        const interval = setInterval(async () => {
          if (!(await redis.get(redisKey2))) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
      return await this.findGuilds();
    }

    await redis.set(redisKey2, 'true', 'EX', 120);
    const guildsResult = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getDiscordToken()}`,
      },
    });

    if (!guildsResult.ok) {
      console.error('Error fetching guilds:', guildsResult.statusText);
      return [];
    }

    const guilds = await guildsResult.json();
    await redis.set(redisKey, JSON.stringify(guilds), 'EX', 120);
    await redis.del(redisKey2);

    return guilds;
  }

  async findGuildsWithPerms() {
    const guilds = await this.findGuilds();
    const permGuildsID = [];

    for (const guildData of guilds) {
      if (guildData.owner || (guildData.permissions & 0x8) === 0x8) {
        permGuildsID.push(guildData);
      }
    }

    return permGuildsID;
  }

  async findGuildsWithPermsForPanel() {
    return await getUserGuildsWithPermsForPanel(this);
  }

  async isAdminOfGuild(guildID) {
    const guilds = await this.findGuildsWithPerms();

    for (const guild of guilds) {
      if (guild.id === guildID) {
        return true;
      }
    }

    return false;
  }
}

export async function getPanelUserFromDiscordID(discordID) {
  const panelInfo = await gm_panelToken.findOne({
    where: {
      discordID: discordID,
    },
  });

  const discordInfo = await gm_discordToken.findOne({
    where: {
      discordID: discordID,
    },
  });

  const user = await getUserFromDiscordID(discordID);

  if (!panelInfo || !discordInfo || !user) {
    return null;
  }

  return new PanelUser({
    user: user,
    discordID: panelInfo.discordID,
    panelToken: {
      token: panelInfo.accessToken,
      creationDate: panelInfo.creationDate,
      expirationDate: panelInfo.expirationDate,
    },
    discordToken: {
      token: discordInfo.accessToken,
      refreshToken: discordInfo.refreshToken,
      creationDate: discordInfo.creationDate,
      expirationDate: discordInfo.expirationDate,
    },
  });
}
