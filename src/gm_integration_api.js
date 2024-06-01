import './utils/instrument.js';
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
import promBundle from 'express-prom-bundle';
import { rateLimit } from 'express-rate-limit';

// Database
executeSqlFile('./src/database/schema.sql').then(() => {
  gmLog('mysql2', 'Database schema created');
});

// Express
const app = express();
app.set('trust proxy', true);

// Rate Limit
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    handler: (req, res) => {
      console.log('Rate limit exceeded for', req.ip);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    },
  }),
);

// CORS
app.use(cors(corsMiddleware));

// Helmet

// Helmet
const whiteList = [
  'https://cdnjs.cloudflare.com/ajax/libs/socket.io/',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/',
];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com'],
        connectSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com',
        ],
        imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://cdn.discordapp.com/attachments'],
        frameSrc: ["'self'", ...whiteList],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);

// Raw Body
app.use(rawBodyMiddleware);

// Prometheus
app.use(promBundle({ includeMethod: true }));

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
