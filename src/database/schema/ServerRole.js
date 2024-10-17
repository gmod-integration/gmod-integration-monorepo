import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

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
    role: {
      type: DataTypes.STRING,
    },
    roleName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    prefix: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    discordRoleID: {
      type: DataTypes.STRING,
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
