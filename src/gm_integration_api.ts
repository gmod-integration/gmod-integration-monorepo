// import './utils/instrument.js';
import { ConfigServer } from './classes/config/Config.js';
import './utils/update-log.js';
import express, { NextFunction, Request, Response } from 'express';
import { gmLog } from './utils/logger.js';
import rawBodyMiddleware from './middleware/rawBodyMiddleware.js';
import loggerMiddleware from './middleware/v3/loggers.js';
import cors from 'cors';
import helmet from 'helmet';
import mainRoutes from './routes/mainRoutes.js';
import useragent from 'express-useragent';
// import * as Sentry from '@sentry/node';
import errorMiddleware from './middleware/errorMiddleware.js';
import { gracefulShutdownDiscord, loadDiscordMain, loadDiscordSlave } from './discord/index.js';
import { initializeDiscordQueueWorkers } from './discord/workers/discordQueueWorkers.js';
import { gracefulShutdownRedis } from '@gmod/infra-redis/index.js';
import { gracefulShutdownPrisma } from '@gmod/infra-prisma/index.js';
import { gracefulShutdownMongo } from './database/gm_server_logs.js';
import '@gmod/infra-bullmq/index.js';

// Load the main discord instance
async function runDiscord() {
  await loadDiscordMain();
  await initializeDiscordQueueWorkers();
  await loadDiscordSlave();
}

await runDiscord();

// Express
const app = express();
app.set('trust proxy', true);

// User Agent
app.use(useragent.express());

let inShutdown = false;
app.use((req: Request, res: Response, next: NextFunction) => {
  if (inShutdown) {
    res.status(503).json({ error: 'Server is in the process of restarting' });
  } else {
    next();
  }
});

// CORS
app.use(
  cors((req: Request, callback: any) => {
    const origin = req.headers.origin;
    if (
      !origin ||
      origin.includes('gmod-integration.com') ||
      (ConfigServer.dev && (origin.includes('localhost') || origin.includes('127.0.0.1')))
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }),
);

app.use((req: Request, res: Response, next: NextFunction) => {
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
app.use(express.json({ limit: ConfigServer.bodyLimit, type: 'application/json' }));
app.use(express.urlencoded({ limit: ConfigServer.bodyLimit, extended: true }));

// Logger
app.use(loggerMiddleware);

// Routes
app.use(mainRoutes);

// 404
app.all(/.*/, (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ error: '404 Not Found' });
});

// Sentry
// Sentry.setupExpressErrorHandler(app);

// Errors
app.use(errorMiddleware);

// Listen
app.listen(ConfigServer.ports.api, () => {
  gmLog('express', '- - - - - - - - - - - - - - - - - - -');
  gmLog('express', `Server started and listening on port ${ConfigServer.ports.api}`);
  gmLog('express', '- - - - - - - - - - - - - - - - - - -');
});

// Unhandled Errors
process.on('unhandledRejection', (error: Error) => {
  gmLog('unhandledRejection', error.message, true);
  console.error(error);
});

// Run Tests
if (ConfigServer.dev) {
  import('./test/index.js');
}

async function gracefulShutdown() {
  gmLog('shutdown', 'Gracefully shutting down...');
  inShutdown = true;
  // await Sentry.flush(2000);
  await gracefulShutdownDiscord();
  await gracefulShutdownRedis();
  await gracefulShutdownPrisma();
  await gracefulShutdownMongo();
  process.exit(0);
}

// Capture termination signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
