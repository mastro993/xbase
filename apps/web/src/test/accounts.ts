import { saveAccount, type XProfile } from '@/features/accounts/accounts.server';

/** Links an X account in the test database (see createTestDb); returns its id. */
export function seedAccount(profile: Partial<XProfile> = {}): string {
  const id = profile.id ?? '1001';
  saveAccount(
    {
      id,
      username: profile.username ?? `user${id}`,
      name: profile.name ?? `User ${id}`,
      avatarUrl: profile.avatarUrl ?? null,
    },
    {
      accessToken: `access-${id}`,
      refreshToken: `refresh-${id}`,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      scope: 'tweet.read users.read tweet.write offline.access',
    },
  );
  return id;
}
