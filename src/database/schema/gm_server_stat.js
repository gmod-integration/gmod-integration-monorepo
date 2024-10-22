import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class gm_server_stat extends Model {
  isSuperAdmin() {
    return this.rank === 'superadmin';
  }
}

gm_server_stat.init(
  {
    server_id: {
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
    steam_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'gm_user_steam',
        key: 'steam_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    rank: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'user',
    },
    total_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_death: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_kill: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_money: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_connect: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    last_connect: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
    },
    first_join: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    custom_values: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    bypassMaintenance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_stat',
    tableName: 'gm_server_stat',
    timestamps: true,
  },
);

gm_server_stat
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_stat');
  })
  .catch((error) => {
    console.error('Error creating gm_server_stat table:', error);
  });

export default gm_server_stat;
