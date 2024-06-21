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
    guild: {
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
    modelName: 'GmodStorePurchases',
    tableName: 'GmodStorePurchases',
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
