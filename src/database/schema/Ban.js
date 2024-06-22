import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class Ban extends Model {}

Ban.init(
  {
    steamID64: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    discordID: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    banDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    banTime: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    unbanDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    admin: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    permanent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'banUsers',
    tableName: 'banUsers',
    timestamps: true,
  },
);

Ban.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: Ban');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default Ban;
