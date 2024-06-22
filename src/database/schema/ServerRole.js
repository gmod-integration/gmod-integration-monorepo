import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerRole extends Model {}

ServerRole.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    serverID: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    roleID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    roleName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    prefix: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    discordRoleID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    enablePrefix: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    enableSync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_roles',
    tableName: 'gm_server_roles',
    timestamps: true,
  },
);

ServerRole.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerRole');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerRole;
