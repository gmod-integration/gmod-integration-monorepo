import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_server extends Model {
  // Extend the class here
}

gm_server.init(
  {
    id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    publicTempToken: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    guild: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    ip: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    port: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    name: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    image: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    bump: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server',
    tableName: 'gm_server',
    timestamps: true,
  },
);

gm_server
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server');
  })
  .catch((error) => {
    console.error('Error creating gm_server table:', error);
  });

export default gm_server;
