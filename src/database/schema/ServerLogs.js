import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';
import { wsSendToAllClientsOfServer } from '../../websockets/index.js';

class ServerLogs extends Model {}

ServerLogs.init(
  {
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_logs',
    tableName: 'gm_server_logs',
    timestamps: true,
  },
);

ServerLogs.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerLogs');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerLogs;

export async function logServer(serverID, type, data) {
  try {
    await ServerLogs.create({
      serverID,
      type,
      data,
    });
    await wsSendToAllClientsOfServer(serverID, 'server_logs', { type, data });
  } catch (error) {
    console.error(error);
  }
}
