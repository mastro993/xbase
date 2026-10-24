import { definePlugin } from 'nitro';
import { getEnv, needsHttpsWarning } from './env.server';

// A production server stops at boot. In `vite dev`, exiting would only make Nitro restart its
// runner in a loop, so it logs and keeps going: requests then show the same error.
function fail(...message: unknown[]) {
  console.error('[xbase]', ...message);
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

function loadEnv() {
  try {
    return getEnv();
  } catch (error) {
    fail(
      error instanceof Error ? error.message : error,
      '\n[xbase] Set them in apps/web/.env or in the container environment.',
    );
    return undefined;
  }
}

// A Nitro runtime plugin: Nitro bundles it on its own (not in the Start graph) and runs it once
// at boot, before the server listens, in dev and in production.
export default definePlugin((nitroApp) => {
  const env = loadEnv();
  if (!env) return;
  if (needsHttpsWarning(env)) {
    console.warn(
      `[xbase] APP_URL is ${env.APP_URL}: MCP clients need an HTTPS URL to connect. The web app works over plain HTTP.`,
    );
  }

  // Nitro imports the Start bundle on the first request. Load it now, so src/server.ts opens the
  // database (running migrations) and starts the scheduler at boot, and a broken database stops
  // the server instead of failing the first visitor.
  void Promise.resolve(nitroApp.fetch(new Request('http://localhost/api/health'))).then(
    (response) => {
      if (!response.ok) fail(`Startup check failed: /api/health returned ${response.status}`);
    },
    (error: unknown) => fail('Startup check failed:', error),
  );
});
