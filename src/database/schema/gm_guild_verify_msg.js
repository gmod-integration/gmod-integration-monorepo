import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_guild_verify_msg extends Model {
  // Extend the class here //
}

gm_guild_verify_msg.init(
  {
    guildID: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: {
        model: 'gm_guild',
        key: 'guild',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    messageID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    channelID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_guild_verify_msg',
    tableName: 'gm_guild_verify_msg',
    timestamps: true,
  },
);

gm_guild_verify_msg
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_guild_verify_msg');
  })
  .catch((error) => {
    console.error('Error creating gm_guild_verify_msg table:', error);
  });

export default gm_guild_verify_msg;
