import { DEV } from "solid-js";
import * as Sentry from "@sentry/solid";
import { solidRouterBrowserTracingIntegration } from "@sentry/solid/solidrouter";

if (!DEV) {
  Sentry.init({
    dsn: "https://464a24d3f41ae8ec2924a8b2a4015330@o4507354544472064.ingest.de.sentry.io/4508704710590544",
    integrations: [solidRouterBrowserTracingIntegration(), Sentry.replayIntegration()],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for tracing.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
    tracePropagationTargets: ["localhost", /^https:\/\/.gmod-integration\.com/],

    // Capture Replay for 10% of all sessions,
    // plus 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
