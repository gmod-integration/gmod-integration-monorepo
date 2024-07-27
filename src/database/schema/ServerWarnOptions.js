import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerWarnOptions extends Model {}

ServerWarnOptions.init(
  {
    msgID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
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
    steamID64: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    total: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    limit: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    offset: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    order: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_warn_options',
    tableName: 'gm_server_warn_options',
    timestamps: true,
  },
);

ServerWarnOptions.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerWarnOptions');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerWarnOptions;
