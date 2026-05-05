import * as Sentry from '@sentry/react';

const DSN = "https://a0a6a937e751b39ecf7303042f45cd6e@sentry.livinglogic.de/42";
const ENVIRONMENT = "dashboard-694d77fcc1d4d50e79b93d47";
const RELEASE = "0.0.112";
const APPGROUP_ID = "694d77fcc1d4d50e79b93d47";

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT || undefined,
    release: RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  if (APPGROUP_ID) {
    Sentry.setTag('appgroup_id', APPGROUP_ID);
  }
}

export { Sentry };
