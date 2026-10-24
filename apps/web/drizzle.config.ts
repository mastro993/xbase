import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit reads .env from this folder itself. `migrate` and `studio` fail with "unable to
// open database file" when the folder doesn't exist yet.
const url = process.env.DATABASE_PATH ?? './data/xbase.db';
mkdirSync(dirname(url), { recursive: true, mode: 0o700 });

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  // A plain path: kit passes it straight to node:sqlite, so no "file:" prefix.
  dbCredentials: { url },
});
