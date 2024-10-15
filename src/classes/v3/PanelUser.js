import { getUserFromDiscordID } from './User.js';
import { getUserGuildsWithPermsForPanel } from '../../models/v3/discordModels.js';
import redis from '../../redis/index.js';
import gm_panelToken from '../../database/schema/gm_panelToken.js';
import gm_discordToken from '../../database/schema/gm_discordToken.js';
import { Op } from 'sequelize';

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

  isValidDiscordToken() {
    return new Date() < new Date(this.discordToken.expirationDate);
  }

  getDiscordToken() {
    return this.discordToken.token;
  }

  async isValidPanelToken(token) {
    const tokens = await gm_panelToken.findAll({
      where: {
        discordID: this.discordID,
        accessToken: token,
        expirationDate: {
          [Op.gt]: new Date(),
        },
      },
    });

    return tokens.length > 0;
  }

  async authAllowed(token) {
    return (await this.isValidPanelToken(token)) && this.isValidDiscordToken();
  }

  async findGuilds() {
    const redisKey = `user:${this.discordID}:guilds`;
    const redisKey2 = `user:${this.discordID}:isWaitingGuilds`;

    const cachedUserGuilds = await redis.get(redisKey);
    if (cachedUserGuilds !== null) {
      return JSON.parse(cachedUserGuilds);
    }

    // Utiliser un verrou Redis pour assurer une seule exécution à la fois
    let lockAcquired = false;
    while (!lockAcquired) {
      lockAcquired = await redis.set(redisKey2, 'true', 'NX', 'EX', 120);
      if (!lockAcquired) {
        // Attendre avant de réessayer d'acquérir le verrou
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    try {
      // Re-vérifie si les données ont été mises en cache pendant l'attente.
      const cachedUserGuildsAgain = await redis.get(redisKey);
      if (cachedUserGuildsAgain !== null) {
        return JSON.parse(cachedUserGuildsAgain);
      }

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
      return guilds;
    } finally {
      // Assure que le flag `isWaitingGuilds` est toujours supprimé même si la requête échoue.
      await redis.del(redisKey2);
    }
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
    order: [['createdAt', 'DESC']],
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
