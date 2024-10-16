import { Sequelize } from 'sequelize';
import { databaseConfig } from '../config/index.js';
import { gmLog } from '../utils/logger.js';

const sequelize = new Sequelize({
  dialect: 'mariadb',
  host: databaseConfig.host,
  username: databaseConfig.user,
  password: databaseConfig.password,
  database: databaseConfig.database,
  logging: false,
});

try {
  await sequelize.authenticate();
  gmLog('sequelize', 'Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
}

export default sequelize;
