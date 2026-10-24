import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// The schema and its migrations live in @xbase/db; the database is this app's. drizzle-kit reads
// .env from this folder itself. `migrate` and `studio` fail with "unable to open database file"
// when the folder doesn't exist yet.
const url = process.env.DATABASE_PATH ?? './data/xbase.db';
mkdirSync(dirname(url), { recursive: true, mode: 0o700 });

export default defineConfig({
  dialect: 'sqlite',
  schema: '../../packages/db/src/schema.ts',
  out: '../../packages/db/drizzle',
  // A plain path: kit passes it straight to node:sqlite, so no "file:" prefix.
  dbCredentials: { url },
});
