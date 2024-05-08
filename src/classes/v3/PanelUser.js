import { getConnectionPromise } from '../../database/connection.js';
import { getUserFromDiscordID } from './User.js';
import { getUserGuildsWithPermsForPanel } from '../../models/v3/discordModels.js';

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

  async findGuildsWithPerms() {
    const guildsResult = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getDiscordToken()}`,
      },
    });

    if (!guildsResult.ok) {
      return [];
    }

    const permGuildsID = [];
    for (const guildData of await guildsResult.json()) {
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
