import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_guild_verify_role extends Model {
  // Extend the class here //
}

gm_guild_verify_role.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
      type: DataTypes.STRING,
      allowNull: false,
    },
    isGiveRole: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_guild_verify_role',
    tableName: 'gm_guild_verify_role',
    timestamps: true,
  },
);

gm_guild_verify_role
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_guild_verify_role');
  })
  .catch((error) => {
    console.error('Error creating gm_guild_verify_role table:', error);
  });

export default gm_guild_verify_role;
