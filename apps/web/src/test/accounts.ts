import type { XProfile } from '@/features/accounts/accounts.server';
import { getDb } from '@/server/db/client.server';
import { xAccounts } from '@/server/db/schema';

/**
 * Links an X account in the test database (see createTestDb); returns its id. Inserts the row
 * directly, so tests don't need the environment saveAccount encrypts tokens with; the tokens are
 * placeholders.
 */
export function seedAccount(profile: Partial<XProfile> = {}): string {
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
