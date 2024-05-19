import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_status_button extends Model {
  // Extend the class here
}

gm_status_button.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    server: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    emoji: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    enable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'gm_status_button',
    tableName: 'gm_status_button',
    timestamps: true,
  },
);

gm_status_button
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_status_button');
  })
  .catch((error) => {
    console.error('Error creating gm_status_button table:', error);
  });

export default gm_status_button;
