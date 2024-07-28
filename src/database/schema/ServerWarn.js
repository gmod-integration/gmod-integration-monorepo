import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerWarn extends Model {}

ServerWarn.init(
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
    userSteamID64: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    adminSteamID64: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_warn',
    tableName: 'gm_server_warn',
    timestamps: true,
  },
);

ServerWarn.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerWarn');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerWarn;
