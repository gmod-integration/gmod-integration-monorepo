import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerVote extends Model {
  // Extend Here
}

ServerVote.init(
  {
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
    userID: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_user',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
  },
  {
    sequelize,
    modelName: 'gm_server_vote',
    tableName: 'gm_server_vote',
    timestamps: true,
  },
);

ServerVote.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_vote');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerVote;
