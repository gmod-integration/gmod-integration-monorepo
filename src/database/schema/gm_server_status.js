import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class gm_server_status extends Model {
  // Extend the class here
}

gm_server_status.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    hostname: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    maxPlayers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    players: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    map: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    gameMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    sequelize,
    modelName: 'gm_server_status',
    tableName: 'gm_server_status',
    timestamps: true,
  },
);

gm_server_status
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_status');
  })
  .catch((error) => {
    console.error('Error creating gm_server_status table:', error);
  });

export default gm_server_status;
