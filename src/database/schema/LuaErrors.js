import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class LuaErrors extends Model {
  // Extend the class here
}

LuaErrors.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    realm: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    stack: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    identifier: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workshopID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    uptime: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_errors',
    tableName: 'gm_errors',
    timestamps: true,
  },
);

LuaErrors.beforeCreate((token, options) => {
  const currentDate = new Date();
  token.expirationDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
});

LuaErrors.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: LuaErrors');
  })
  .catch((error) => {
    console.error('Error creating LuaErrors table:', error);
  });

export default LuaErrors;
