import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class ServerSyncRole extends Model {}

ServerSyncRole.init(
  {
    serverID: {
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
    roleID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    userGroup: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    enable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_sync_roles',
    tableName: 'gm_server_sync_roles',
    timestamps: true,
  },
);

ServerSyncRole.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerSyncRole');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerSyncRole;
