import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_panelToken extends Model {
  // Extend the class here
}

gm_panelToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    discordID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    accessToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    os: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    browser: {
      type: DataTypes.STRING,
      allowNull: true,
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
