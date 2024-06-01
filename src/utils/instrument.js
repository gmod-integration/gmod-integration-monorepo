import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { serverConfig } from '../config/index.js';

Sentry.init({
  dsn: serverConfig.sentryDSN,
  integrations: [nodeProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});
