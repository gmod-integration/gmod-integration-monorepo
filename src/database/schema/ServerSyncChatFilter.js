import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerSyncChatFilter extends Model {}

ServerSyncChatFilter.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
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
    element: {
      type: DataTypes.ENUM('message', 'teamName', 'userGroup', 'steamID64'),
      allowNull: false,
      defaultValue: 'message',
    },
    operator: {
      type: DataTypes.ENUM('contain', 'notContain', 'equal', 'notEqual', 'startWith', 'endWith'),
      allowNull: false,
      defaultValue: 'startWith',
    },
    trigger: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    action: {
      type: DataTypes.ENUM('block', 'relay', 'anonymize'),
      allowNull: false,
      defaultValue: 'block',
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_sync_chat_filter',
    tableName: 'gm_server_sync_chat_filter',
    timestamps: true,
  },
);

ServerSyncChatFilter.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_sync_chat_filter');
  })
  .catch((error) => {
    console.error('Error creating table: gm_server_sync_chat_filter', error);
  });

export default ServerSyncChatFilter;
