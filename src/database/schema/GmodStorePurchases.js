import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class GmodStorePurchases extends Model {
  // Extend the class here
}

GmodStorePurchases.init(
  {
    steamID64: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    userID: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    guild: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    revoke: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_gmodstore_purchases',
    tableName: 'gm_gmodstore_purchases',
    timestamps: true,
  },
);

GmodStorePurchases.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: GmodStorePurchases');
  })
  .catch((error) => {
    console.error('Error creating GmodStorePurchases table:', error);
  });

export default GmodStorePurchases;
