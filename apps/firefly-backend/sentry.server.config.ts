import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true,
  tracesSampleRate: 1.0, // capture 100% for testing; lower in prod
  integrations: [
    Sentry.replayIntegration(), // optional: screen replay for frontend
    Sentry.consoleLoggingIntegration({ levels: ["error", "warn"] }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});