import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { serverConfig } from '../config';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: serverConfig.sentryDSN,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});
