import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class ServerPlayerSession extends Model {}

ServerPlayerSession.init(
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
    steamID64: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_user_steam',
        key: 'steam_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    kills: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    deaths: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    customValues: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'gm_server_stat_session',
    tableName: 'gm_server_stat_session',
    timestamps: true,
  },
);

ServerPlayerSession.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerPlayerSession');
  })
  .catch((error) => {
    console.error('Error creating ServerPlayerSession table:', error);
  });

export default ServerPlayerSession;
