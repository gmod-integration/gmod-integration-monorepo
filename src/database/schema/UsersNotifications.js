import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class UsersNotifications extends Model {
  // Extend the class here
}

UsersNotifications.init(
  {
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_users_notifications',
    tableName: 'gm_users_notifications',
    timestamps: true,
  },
);

UsersNotifications.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: UsersNotifications');
  })
  .catch((error) => {
    console.error('Error creating UsersNotifications table:', error);
  });

export default UsersNotifications;

export async function createNotification(discordID, type, message) {
  try {
    await UsersNotifications.create({
      discordID,
      type,
      message,
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}
