import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class GuildSettings extends Model {
  // Extend the class here
}

GuildSettings.init(
  {
    guildID: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    setting: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_guild_settings',
    tableName: 'gm_guild_settings',
    timestamps: true,
  },
);

GuildSettings.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_guild_settings');
  })
  .catch((error) => {
    console.error('Error creating gm_guild_settings table:', error);
  });

export default GuildSettings;
