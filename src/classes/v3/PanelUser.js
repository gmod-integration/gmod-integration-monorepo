import { getConnectionPromise } from '../../database/connection.js';
import { getUserFromDiscordID } from './User.js';
import { getUserGuildsWithPermsForPanel } from '../../models/v3/discordModels.js';
import redis from '../../redis/index.js';

export class PanelUser {
  constructor(obj = {}) {
    this.user = obj.user;
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
    const redisKey = `user:${this.user.id}:guilds`;
    const cachedUserGuilds = await redis.get(redisKey);
    if (cachedUserGuilds !== null) {
      return JSON.parse(cachedUserGuilds);
    }

    const redisKey2 = `user:${this.user.id}:isWaitingGuilds`;
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

    await redis.set(redisKey2, 'true');
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
    await redis.set(redisKey, JSON.stringify(guilds), 'EX', 30);
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
  const connection = await getConnectionPromise();
  const queryPanelToken = `SELECT *
                           FROM gm_panelToken
                           WHERE discordID = ?`;
  const [rowsPanelToken] = await connection.execute(queryPanelToken, [discordID]);
  if (rowsPanelToken.length === 0) {
    return null;
  }

  const queryDiscordToken = `SELECT *
                             FROM gm_discordToken
                             WHERE discordID = ?`;
  const [rowsDiscordToken] = await connection.execute(queryDiscordToken, [discordID]);
  if (rowsDiscordToken.length === 0) {
    return null;
  }

  const user = await getUserFromDiscordID(discordID);
  if (!user) {
    return null;
  }

  return new PanelUser({
    user: user,
    discordID: rowsPanelToken[0].discordID,
    panelToken: {
      token: rowsPanelToken[0].accessToken,
      creationDate: rowsPanelToken[0].creationDate,
      expirationDate: rowsPanelToken[0].expirationDate,
    },
    discordToken: {
      token: rowsDiscordToken[0].accessToken,
      refreshToken: rowsDiscordToken[0].refreshToken,
      creationDate: rowsDiscordToken[0].creationDate,
      expirationDate: rowsDiscordToken[0].expirationDate,
    },
  });
}
