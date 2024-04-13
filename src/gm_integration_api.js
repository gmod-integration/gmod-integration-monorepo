import express from 'express';
import statusMonitor from 'express-status-monitor';
import {serverConfig} from './config/index.js';
import {gmLog} from './utils/logger.js';
import rawBodyMiddleware from './middleware/rawBodyMiddleware.js';
import loggerMiddleware from './middleware/v3/loggers.js';
import webhooksRoutes from './routes/webhooks/_webhooksRoutes.js';
import v3Routes from './routes/v3/_v3Routes.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import {executeSqlFile} from "./database/connection.js";

// Database
executeSqlFile('./src/database/schema.sql').then(() => {
    gmLog('mysql2', 'Database schema created');
});

// Express
const app = express();
app.set('trust proxy', true);

// Middleware
app.use(rawBodyMiddleware);
//
// Body Parser
app.use(express.json({limit: serverConfig.bodyLimit, type: 'application/json'}));
app.use(express.urlencoded({limit: serverConfig.bodyLimit, extended: true}));

// Logger
app.use(loggerMiddleware);

// Routes
app.use(statusMonitor());
app.use('/screenshots', express.static('screenshots'));
app.use('/webhooks', webhooksRoutes);
app.use('/v3', v3Routes);

// 404
app.all('*', (req, res) => {
    return res.status(404).json({error: '404 Not Found'});
});

// Errors
app.use(errorMiddleware);

// Listen
app.listen(serverConfig.ports.api, () => gmLog('system', `API listening on port ${serverConfig.ports.api}`));