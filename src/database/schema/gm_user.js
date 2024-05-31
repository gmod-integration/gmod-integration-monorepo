import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_user extends Model {
  // Extend the class here
}

gm_user.init(
  {
    id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    rank: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'user',
    },
    steam: {
      type: DataTypes.STRING,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    last_oauth: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    trust: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
    },
    token: {
      type: DataTypes.STRING,
    },
    token_expires: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'gm_user',
    tableName: 'gm_user',
    timestamps: true,
  },
);

gm_user
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_user');
  })
  .catch((error) => {
    console.error('Error creating gm_user table:', error);
  });

export default gm_user;
