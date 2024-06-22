import ServerRole from '../../database/schema/ServerRole.js';

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
  const roleData = await ServerRole.findOne({
    where: {
      serverID,
      discordRoleID,
    },
  });

  if (roleData) {
    return new Role(roleData);
  }

  return null;
}

export async function getRoleFromRole(serverID, role) {
  const roleData = await ServerRole.findOne({
    where: {
      serverID,
      role,
    },
  });

  if (roleData) {
    return new Role(roleData);
  }

  return null;
}
