import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_panelToken extends Model {
  // Extend the class here
}

gm_panelToken.init(
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
    modelName: 'gm_panelToken',
    tableName: 'gm_panelToken',
    timestamps: true,
  },
);

gm_panelToken.beforeCreate((token, options) => {
  const currentDate = new Date();
  token.expirationDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
});

gm_panelToken
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_panelToken');
  })
  .catch((error) => {
    console.error('Error creating gm_panelToken table:', error);
  });

export default gm_panelToken;
