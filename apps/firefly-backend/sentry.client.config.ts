import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0, // capture 100% for testing; lower in prod
  integrations: [
    Sentry.replayIntegration(), // optional: screen replay for frontend
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});