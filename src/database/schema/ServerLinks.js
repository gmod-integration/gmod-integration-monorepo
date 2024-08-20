import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerLinks extends Model {
  getUrlBase64() {
    return Buffer.from(this.url).toString('base64');
  }
}

ServerLinks.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'https://example.com',
    },
    alias: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Example',
    },
    guild: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_guild',
        key: 'guild',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_links',
    tableName: 'gm_server_links',
    timestamps: true,
  },
);

ServerLinks.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_links');
  })
  .catch((error) => {
    console.error('Error creating table: gm_server_links', error);
  });

export default ServerLinks;
