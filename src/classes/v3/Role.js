import { getConnectionPromise } from '../../database/connection.js';

export class Role {
  constructor(obj = {}) {
    this.id = obj.id || null;
    this.serverID = obj.serverID || null;
    this.discordRoleID = obj.discordRoleID || null;
    this.role = obj.role || null;
    this.roleName = obj.roleName || null;
    this.prefix = obj.prefix || null;
    this.enablePrefix = obj.enablePrefix || null;
    this.enableSync = obj.enableSync || null;
  }

  isValid() {
    return this.id !== null;
  }

  isSyncEnabled() {
    return this.enableSync === 1;
  }

  getDiscordRoleID() {
    return this.discordRoleID;
  }
}

export async function getRoleFromDiscordRoleID(serverID, discordRoleID) {
  try {
    const connection = await getConnectionPromise();
    const [results] = await connection.query('SELECT * FROM gm_server_roles WHERE serverID = ? AND discordRoleID = ?', [
      serverID,
      discordRoleID,
    ]);
    if (results.length > 0) {
      return new Role(results[0]);
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getRoleFromRole(serverID, role) {
  try {
    const connection = await getConnectionPromise();
    const [results] = await connection.query('SELECT * FROM gm_server_roles WHERE serverID = ? AND role = ?', [
      serverID,
      role,
    ]);
    if (results.length > 0) {
      return new Role(results[0]);
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}
