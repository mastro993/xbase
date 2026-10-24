import { fileURLToPath } from 'node:url';
import { type Db, openDb } from '@/server/db/client.server';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * A fresh in-memory database with every migration applied. It also becomes what getDb()
 * returns, so services under test use it. Call it in beforeEach.
 */
export function createTestDb(): Db {
  const db = openDb(':memory:', MIGRATIONS);
  globalThis.xbaseDb = db;
  return db;
}
