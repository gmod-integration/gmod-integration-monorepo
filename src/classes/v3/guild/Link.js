import sequelize from '../../../database/sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../../utils/logger.js';

class Link extends Model {
  getUrlBase64() {
    return Buffer.from(this.url).toString('base64');
  }
}

Link.init(
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
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Link',
    tableName: 'gm_link',
    timestamps: false,
  },
);

Link.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_link');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default Link;
