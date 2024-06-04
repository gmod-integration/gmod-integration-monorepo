import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_guild_auto_roles extends Model {
  // Extend the class here //
}

gm_guild_auto_roles.init(
  {
    guildID: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_guild',
        key: 'guild',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    roleID: {
      primaryKey: true,
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_guild_auto_roles',
    tableName: 'gm_guild_auto_roles',
    timestamps: true,
  },
);

gm_guild_auto_roles
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_guild_auto_roles');
  })
  .catch((error) => {
    console.error('Error creating gm_guild_auto_roles table:', error);
  });

export default gm_guild_auto_roles;
