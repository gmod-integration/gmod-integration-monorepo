import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_server_leaderboard_options extends Model {
  // Extend the class here
}

gm_server_leaderboard_options.init(
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
    messageID: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    limitValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    offsetValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    orderValue: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'DESC',
    },
    page: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    totalPage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_leaderboard_options',
    tableName: 'gm_server_leaderboard_options',
    timestamps: true,
  },
);

gm_server_leaderboard_options
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_leaderboard_options');
  })
  .catch((error) => {
    console.error('Error creating gm_server_leaderboard_options table:', error);
  });

export default gm_server_leaderboard_options;
