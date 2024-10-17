import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class PremiumGuild extends Model {
  // Extend the class here
}

PremiumGuild.init(
  {
    guildID: {
      type: DataTypes.STRING,
      primaryKey: true,
      references: {
        model: 'gm_guild',
        key: 'guild',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    transaction: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    buyer: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'gm_guild_premium',
    tableName: 'gm_guild_premium',
    timestamps: true,
  },
);

PremiumGuild.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_guild_premium');
  })
  .catch((error) => {
    console.error('Error creating gm_guild_premium table:', error);
  });

export default PremiumGuild;
