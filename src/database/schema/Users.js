import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class Users extends Model {
  // Extend the class here
}

Users.init(
  {
    steamID64: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    steamID: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    lastIP: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    IPS: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    sequelize,
    modelName: 'users',
    tableName: 'users',
    timestamps: true,
  },
);

Users.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: Users');
  })
  .catch((error) => {
    console.error('Error creating Users table:', error);
  });

export default Users;
