import { serverConfig } from '../classes/config/Config.js';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

if (!serverConfig.dev) {
  Sentry.init({
    dsn: serverConfig.sentryDSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}
