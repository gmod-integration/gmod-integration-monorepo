import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { serverConfig } from '../config/index.js';
import * as Sentry from '@sentry/node';

if (!serverConfig.dev) {
  Sentry.init({
    dsn: serverConfig.sentryDSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}
