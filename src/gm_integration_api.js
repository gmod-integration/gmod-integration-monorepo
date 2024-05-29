import './utils/update-log.js';
import express from 'express';
import { serverConfig } from './config/index.js';
import { gmLog } from './utils/logger.js';
import rawBodyMiddleware from './middleware/rawBodyMiddleware.js';
import loggerMiddleware from './middleware/v3/loggers.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import { executeSqlFile } from './database/connection.js';
import cors from 'cors';
import corsMiddleware from './middleware/corsMiddleware.js';
import './websockets/index.js';
import helmet from 'helmet';
import mainRoutes from './routes/mainRoutes.js';

// Database
executeSqlFile('./src/database/schema.sql').then(() => {
  gmLog('mysql2', 'Database schema created');
});

// Express
const app = express();
app.set('trust proxy', true);

// Middleware
app.use(helmet());
app.use(cors(corsMiddleware));
app.use(rawBodyMiddleware);

// Body Parser
app.use(express.json({ limit: serverConfig.bodyLimit, type: 'application/json' }));
app.use(express.urlencoded({ limit: serverConfig.bodyLimit, extended: true }));

// Logger
app.use(loggerMiddleware);

// Routes
app.use(mainRoutes);

// 404
app.all('*', (req, res) => {
  return res.status(404).json({ error: '404 Not Found' });
});

// Errors
app.use(errorMiddleware);

// Listen
app.listen(serverConfig.ports.api, () => {
  gmLog('express', `API listening on port ${serverConfig.ports.api}`);
});

// Unhandled Errors
process.on('unhandledRejection', (error) => {
  gmLog('UNHANDLED REJECTION', error);
});
