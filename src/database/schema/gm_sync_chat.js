import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_sync_chat extends Model {
  // Extend the class here
}

gm_sync_chat.init(
  {
    server: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      primaryKey: true,
    },
    guild: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_guild',
        key: 'guild',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
    },
    id: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    channel: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    sequelize,
    modelName: 'gm_sync_chat',
    tableName: 'gm_sync_chat',
    timestamps: true,
  },
);

gm_sync_chat
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_sync_chat');
  })
  .catch((error) => {
    console.error('Error creating gm_sync_chat table:', error);
  });

export default gm_sync_chat;
