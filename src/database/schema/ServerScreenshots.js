import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class ServerScreenshots extends Model {}

ServerScreenshots.init(
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
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    player: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    sequelize,
    modelName: 'gm_server_screenshots',
    tableName: 'gm_server_screenshots',
    timestamps: true,
  },
);

ServerScreenshots.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerScreenshots');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerScreenshots;
