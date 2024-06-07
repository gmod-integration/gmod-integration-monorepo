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
      allowNull: false,
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
    },
  },
  {
    sequelize,
    modelName: 'gm_discordToken',
    tableName: 'gm_discordToken',
    timestamps: true,
  },
);

gm_discordToken.beforeCreate((token, options) => {
  const currentDate = new Date();
  token.expirationDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
});

gm_discordToken
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_discordToken');
  })
  .catch((error) => {
    console.error('Error creating gm_discordToken table:', error);
  });

export default gm_discordToken;
