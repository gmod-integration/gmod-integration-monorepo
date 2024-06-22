import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class GuildNotVerifiedRole extends Model {}

GuildNotVerifiedRole.init(
  {
    guild: {
      type: DataTypes.STRING,
      primaryKey: true,
      references: {
        model: 'gm_guild',
        key: 'guild',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_role_auto',
    tableName: 'gm_role_auto',
    timestamps: true,
  },
);

GuildNotVerifiedRole.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: GuildNotVerifiedRole');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default GuildNotVerifiedRole;
