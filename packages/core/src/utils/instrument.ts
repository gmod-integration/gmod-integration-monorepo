import { ConfigServer } from '@gmod/config'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (!ConfigServer.dev) {
  Sentry.init({
    dsn: ConfigServer.sentryDSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  })
}
