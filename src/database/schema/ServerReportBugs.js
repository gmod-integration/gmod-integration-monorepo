import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.ts';

class ServerReportBugs extends Model {
  // Extend Here
}

ServerReportBugs.init(
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
    steamID64: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.ENUM('open', 'closed'),
      allowNull: false,
      defaultValue: 'open',
    },
    steps: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    expected: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    actual: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    importance: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'trivial', 'critical'),
      allowNull: false,
      defaultValue: 'low',
    },
    screenshot: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    sequelize,
    modelName: 'gm_server_report_bugs',
    tableName: 'gm_server_report_bugs',
    timestamps: true,
  },
);

ServerReportBugs.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: gm_server_report_bugs');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerReportBugs;
