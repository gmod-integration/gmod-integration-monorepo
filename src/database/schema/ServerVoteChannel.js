import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerVoteChannel extends Model {
  // Extend Here
}

ServerVoteChannel.init(
  {
    serverID: {
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
    channelID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    webhookID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    webhookToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_vote_channels',
    tableName: 'gm_server_vote_channels',
    timestamps: true,
  },
);

ServerVoteChannel.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_vote_channels');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerVoteChannel;
