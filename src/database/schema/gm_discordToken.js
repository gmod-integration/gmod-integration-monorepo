import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_discordToken extends Model {
  // Extend the class here
}

gm_discordToken.init(
  {
    discordID: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    accessToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refreshToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    creationDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expirationDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW + 1000 * 60 * 60 * 24 * 7,
    },
  },
  {
    sequelize,
    modelName: 'gm_discordToken',
    tableName: 'gm_discordToken',
    timestamps: true,
  },
);

gm_discordToken
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_discordToken');
  })
  .catch((error) => {
    console.error('Error creating gm_discordToken table:', error);
  });

export default gm_discordToken;
