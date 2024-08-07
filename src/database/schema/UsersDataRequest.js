import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class UsersDataRequest extends Model {
  // Extend the class here
}

UsersDataRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    discordID: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_user',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },
    expirationDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    downloadLink: {
      type: DataTypes.STRING,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_users_data_request',
    tableName: 'gm_users_data_request',
    timestamps: true,
  },
);

UsersDataRequest.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: UsersDataRequest');
  })
  .catch((error) => {
    console.error('Error creating UsersDataRequest table:', error);
  });

export default UsersDataRequest;
