import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_guild extends Model {
  // Extend the class here
}

gm_guild.init(
  {
    guild: {
      type: DataTypes.STRING,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    member: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    language: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'en',
    },
  },
  {
    sequelize,
    modelName: 'gm_guild',
    tableName: 'gm_guild',
    timestamps: false,
  },
);

gm_guild
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_guild');
  })
  .catch((error) => {
    console.error('Error creating gm_guild table:', error);
  });

export default gm_guild;
