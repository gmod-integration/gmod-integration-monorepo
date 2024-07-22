import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class ServerPseudo extends Model {}

ServerPseudo.init(
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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    prefix: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_pseudo',
    tableName: 'gm_server_pseudo',
    timestamps: true,
  },
);

ServerPseudo.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerPseudo');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerPseudo;
