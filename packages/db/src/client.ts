import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

/** Opens (or creates) a SQLite database and applies any pending migrations. */
export function openDb(path: string, migrationsFolder: string) {
  const inMemory = path === ':memory:';
  // The file holds drafts, settings and encrypted X tokens: a new folder and file are the server
  // user's alone. Only what this creates: an existing file may belong to someone else (a bind mount).
  if (!inMemory) mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const created = !inMemory && !existsSync(path);
  const client = new DatabaseSync(path);
  // Before WAL is on: SQLite gives the -wal and -shm files the database file's mode.
  if (created) chmodSync(path, 0o600);
  // WAL lets reads run during a write and is stored in the file; it needs a local disk.
  if (!inMemory) client.exec('PRAGMA journal_mode = WAL');
  client.exec('PRAGMA synchronous = NORMAL');
  // Waits instead of failing when another process (drizzle-kit studio, a backup) holds the lock.
  client.exec('PRAGMA busy_timeout = 5000');
  client.exec('PRAGMA foreign_keys = ON');
  const db = drizzle({ client });
  // Synchronous, and a no-op when the database is up to date.
  migrate(db, { migrationsFolder });
  return db;
}

export type Db = ReturnType<typeof openDb>;

declare global {
  // On globalThis so dev HMR re-evaluating this module keeps one connection.
  var xbaseDb: Db | undefined;
}

/** Opens the app's database at startup; getDb returns it from then on. Later calls keep it. */
export function connectDb(path: string, migrationsFolder: string): Db {
  return (globalThis.xbaseDb ??= openDb(path, migrationsFolder));
}

/** The app's database. */
export function getDb(): Db {
  if (!globalThis.xbaseDb) throw new Error('The database is not open: call connectDb() first.');
  return globalThis.xbaseDb;
}
