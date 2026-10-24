import { resolve } from 'node:path';
import handler from '@tanstack/react-start/server-entry';
import { connectDb } from '@xbase/db/client';
import { getEnv } from '@xbase/server/env';
import { runHousekeeping } from '@xbase/server/housekeeping';
import { type ScheduledJob, type Scheduler, startScheduler } from '@xbase/server/scheduler';

// Start's custom server entry, for its module scope: it runs once per server start, because the
// boot plugin (server/boot.nitro.ts) loads this bundle at boot, and again after a dev HMR edit.

const HOUR = 60 * 60 * 1000;

// Background jobs. Publishing scheduled posts joins this list with the X integration.
const JOBS: ScheduledJob[] = [{ name: 'housekeeping', intervalMs: HOUR, run: runHousekeeping }];

declare global {
  var xbaseSchedulers: Scheduler[] | undefined;
}

// Opens the database and applies pending migrations before the first request. Nothing is
// prerendered, so a build never evaluates this module. cwd is apps/web for `vite dev` and
// `pnpm start`; the Docker image sets MIGRATIONS_DIR.
connectDb(
  getEnv().DATABASE_PATH,
  process.env.MIGRATIONS_DIR ?? resolve('../../packages/db/drizzle'),
);
for (const scheduler of globalThis.xbaseSchedulers ?? []) scheduler.stop();
globalThis.xbaseSchedulers = JOBS.map(startScheduler);

export default handler;
