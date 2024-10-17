import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';
import { getServerFromID } from '../../classes/v3/Server.js';
import redis from '../../redis/index.js';
import { getUserFromSteamID64 } from '../../classes/v3/User.js';

class gm_server_stat extends Model {
  isSuperAdmin() {
    return this.rank === 'superadmin';
  }

  async updateDiscordRole() {
    const user = await getUserFromSteamID64(this.steam_id);
    if (!user) return;

    const server = await getServerFromID(this.server_id);
    if (!server) return;

    const syncDirection = await server.getSetting('sync_role_direction');
    if (syncDirection !== 'both' && syncDirection !== 'gmod-to-discord') {
      return;
    }

    const dscClient = await server.getBotInstance();
    if (!dscClient) return;

    const guild = await server.getDiscordGuild();
    if (!guild) return;

    const member = await guild.members.fetch(user.getDiscordID());
    if (!member) return;

    const syncRoles = await server.getSyncRoles();

    const rankRole = syncRoles.find((role) => role.userGroup === this.rank) || null;

    // get the bot role
    const botMember = guild.members.cache.get(dscClient.user.id);
    if (!botMember) return;

    const botRole = botMember.roles.highest;
    if (!botRole) return;

    // check if the bot role is higher than the rank role
    if (rankRole && botRole.comparePositionTo(guild.roles.cache.get(rankRole.roleID)) <= 0) {
      return;
    }

    const userRoles = member.roles.cache;
    const rolesToRemove = userRoles.filter(
      (role) => syncRoles.some((syncRole) => syncRole.roleID === role.id) && role.id !== rankRole?.roleID,
    );

    // redis the update to avoid dsc |-> gmod sursync
    const redisKey = `sync-role:gmod:server:${server.id}:user:${user.getSteamID64()}`;
    await redis.set(
      redisKey,
      JSON.stringify({
        removeIDs: rolesToRemove.map((role) => role.id),
        addIDs: rankRole ? [rankRole.roleID] : [],
      }),
      'EX',
      120,
    );

    if (rolesToRemove.size > 0) {
      gmLog(
        'sync-ranking',
        `Removing roles from ${member.user.tag}: ${rolesToRemove.map((role) => role.name).join(', ')}`,
      );
      await member.roles.remove(rolesToRemove);
    }

    // if user doesn't have the rank role then add it
    if (rankRole && !member.roles.cache.has(rankRole.roleID)) {
      gmLog('sync-ranking', `Adding role to ${member.user.tag}: ${rankRole.roleName}`);
      await member.roles.add(rankRole.roleID);
    }
  }
}

gm_server_stat.init(
  {
    server_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    steam_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'gm_user_steam',
        key: 'steam_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    rank: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'user',
    },
    total_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_death: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_kill: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_money: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_connect: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    last_connect: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
    },
    first_join: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    custom_values: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    bypassMaintenance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_stat',
    tableName: 'gm_server_stat',
    timestamps: true,
  },
);

gm_server_stat
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_stat');
  })
  .catch((error) => {
    console.error('Error creating gm_server_stat table:', error);
  });

export default gm_server_stat;
