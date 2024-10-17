import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class gm_server_screenshot_channels extends Model {
  // Extend the class here
}

gm_server_screenshot_channels.init(
  {
    server: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      primaryKey: true,
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    adminCmd: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      primaryKey: true,
    },
    channelID: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    webhook: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    sequelize,
    modelName: 'gm_server_screenshot_channels',
    tableName: 'gm_server_screenshot_channels',
    timestamps: true,
  },
);

gm_server_screenshot_channels
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_screenshot_channels');
  })
  .catch((error) => {
    console.error('Error creating gm_server_screenshot_channels table:', error);
  });

export default gm_server_screenshot_channels;
