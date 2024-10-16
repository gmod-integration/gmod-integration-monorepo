import './utils/instrument.js';
import './utils/update-log.js';
import express from 'express';
import { serverConfig } from './config/index.js';
import { gmLog } from './utils/logger.js';
import rawBodyMiddleware from './middleware/rawBodyMiddleware.js';
import loggerMiddleware from './middleware/v3/loggers.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import cors from 'cors';
import corsMiddleware from './middleware/corsMiddleware.js';
import './websockets/index.js';
import helmet from 'helmet';
import mainRoutes from './routes/mainRoutes.js';
import './database/schema/_association.js';
import sequelize from './database/sequelize.js';
import useragent from 'express-useragent';
import { loadDiscordMain, loadDiscordSlave } from './discord/index.js';

const Sentry = require('@sentry/node');

// Database
await sequelize
  .sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Tables created or updated');
  })
  .catch((error) => {
    console.error('Error synchronizing tables:', error);
  });

// Discord
await loadDiscordMain();
await loadDiscordSlave();

// Express
const app = express();
app.set('trust proxy', true);

// User Agent
app.use(useragent.express());

// CORS
app.use(cors(corsMiddleware));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /\.gmod-integration\.com$/.test(origin)) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  next();
});

// Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          '*.gmod-integration.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdnjs.cloudflare.com',
          '*.gmod-integration.com',
        ],
        connectSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com',
          '*.gmod-integration.com',
        ],
        imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', '*.gmod-integration.com'],
        frameSrc: ["'self'", '*.gmod-integration.com', 'https://cdnjs.cloudflare.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: false,
    frameguard: true,
    hsts: true,
    xssFilter: true,
    noSniff: true,
  }),
);

// Raw Body
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

// Sentry
Sentry.setupExpressErrorHandler(app);

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
