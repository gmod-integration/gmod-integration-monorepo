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
      references: {
        model: 'gm_guild',
        key: 'guild',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
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
