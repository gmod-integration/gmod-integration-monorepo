import { Sequelize } from 'sequelize';
import { gmLog } from '../utils/logger.ts';
import { databaseConfig } from '../config';

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
