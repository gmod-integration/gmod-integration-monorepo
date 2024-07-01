import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerLuaError extends Model {
  // Extend the class here
}

ServerLuaError.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    count: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    realm: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    stack: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    steamID64: {
      type: DataTypes.STRING,
      defaultValue: '',
      allowNull: false,
    },
    workshopID: {
      type: DataTypes.STRING,
      defaultValue: '',
      allowNull: false,
    },
    uptime: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_errors',
    tableName: 'gm_server_errors',
    timestamps: true,
  },
);

ServerLuaError.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerLuaError');
  })
  .catch((error) => {
    console.error('Error creating ServerLuaError table:', error);
  });

export default ServerLuaError;
