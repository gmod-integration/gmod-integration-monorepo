import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_status extends Model {
  // Extend the class here
}

gm_status.init(
  {
    server: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    message: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    channel: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    sequelize,
    modelName: 'gm_status',
    tableName: 'gm_status',
    timestamps: true,
  },
);

gm_status
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_status');
  })
  .catch((error) => {
    console.error('Error creating gm_status table:', error);
  });

export default gm_status;
