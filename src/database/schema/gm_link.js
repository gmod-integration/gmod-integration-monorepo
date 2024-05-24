import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';

class gm_link extends Model {
  getUrlBase64() {
    return Buffer.from(this.url).toString('base64');
  }
}

gm_link.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    alias: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
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
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'gm_link',
    tableName: 'gm_link',
    timestamps: true,
  },
);

gm_link
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_link');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default gm_link;
