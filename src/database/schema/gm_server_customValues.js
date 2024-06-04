import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_server_customValues extends Model {
  // Extend the class here
}

gm_server_customValues.init(
  {
    serverID: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    valueName: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    enable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_customValues',
    tableName: 'gm_server_customValues',
    timestamps: true,
  },
);

gm_server_customValues
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_customValues');
  })
  .catch((error) => {
    console.error('Error creating gm_server_customValues table:', error);
  });

export default gm_server_customValues;
