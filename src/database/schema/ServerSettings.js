import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class ServerSetting extends Model {}

ServerSetting.init(
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
    setting: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_settings',
    tableName: 'gm_server_settings',
    timestamps: true,
  },
);

ServerSetting.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerSetting');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerSetting;
