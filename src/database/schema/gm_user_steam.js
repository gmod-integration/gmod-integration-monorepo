import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class gm_user_steam extends Model {
  // Extend the class here
}

gm_user_steam.init(
  {
    steam_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    last_ip: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    last_connect: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
    },
    total_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_death: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_kill: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_connect: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'gm_user_steam',
    tableName: 'gm_user_steam',
    timestamps: true,
  },
);

gm_user_steam
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_user_steam');
  })
  .catch((error) => {
    console.error('Error creating gm_user_steam table:', error);
  });

export default gm_user_steam;
