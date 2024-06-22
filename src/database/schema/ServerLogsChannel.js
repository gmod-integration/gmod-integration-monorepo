import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerLogsChannel extends Model {
  // Extend Here
}

ServerLogsChannel.init(
  {
    serverID: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    channelID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    webhookID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    webhookToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_logs_channel',
    tableName: 'gm_server_logs_channel',
    timestamps: true,
  },
);

ServerLogsChannel.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_logs_channel');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerLogsChannel;
