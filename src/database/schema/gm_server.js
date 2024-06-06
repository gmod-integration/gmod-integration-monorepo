import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_server extends Model {
  async getPublicInformations() {
    return {
      id: this.id,
      name: this.name,
      image: this.image,
      vote: this.vote,
      guild: this.guild,
      verified: this.verified,
      description: this.description,
      ip: this.ip,
      port: this.port,
    };
  }
}

gm_server.init(
  {
    id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    publicTempToken: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    ip: {
      type: DataTypes.STRING,
      defaultValue: '127.0.0.1',
    },
    port: {
      type: DataTypes.STRING,
      defaultValue: '27015',
    },
    name: {
      type: DataTypes.STRING,
      defaultValue: 'New Gmod Server',
    },
    image: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server',
    tableName: 'gm_server',
    timestamps: true,
  },
);

gm_server
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server');
  })
  .catch((error) => {
    console.error('Error creating gm_server table:', error);
  });

export default gm_server;
