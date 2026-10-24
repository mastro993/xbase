import { fileURLToPath } from 'node:url';
import { type Db, getDb, openDb } from './client';
import { type XAccount, xAccounts } from './schema';

// Test helpers for the packages and apps that use the database.

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * A fresh in-memory database with every migration applied. It also becomes what getDb()
 * returns, so services under test use it. Call it in beforeEach.
 */
export function createTestDb(): Db {
  const db = openDb(':memory:', MIGRATIONS);
  globalThis.xbaseDb = db;
  return db;
}

/**
 * Links an X account in the test database (see createTestDb); returns its id. Inserts the row
 * directly, so tests don't need the environment saveAccount encrypts tokens with; the tokens are
 * placeholders.
 */
export function seedAccount(
  profile: Partial<Pick<XAccount, 'id' | 'username' | 'name' | 'avatarUrl'>> = {},
): string {
  const id = profile.id ?? '1001';
  getDb()
    .insert(xAccounts)
    .values({
      id,
      username: profile.username ?? `user${id}`,
      name: profile.name ?? `User ${id}`,
      avatarUrl: profile.avatarUrl ?? null,
      accessToken: `access-${id}`,
      refreshToken: `refresh-${id}`,
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      scope: 'tweet.read users.read tweet.write offline.access',
    })
    .run();
  return id;
}
