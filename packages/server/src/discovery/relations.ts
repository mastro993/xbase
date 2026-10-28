import { NotFoundError, ServiceError } from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import { followedAccounts, hiddenAuthors, xAccounts } from '@xbase/db/schema';
import { eq } from 'drizzle-orm';
import { getAccountCredentials } from '../accounts';
import { getUserList, X_USER_LISTS, type XUserList } from '../x-api-client';

// The account's own lists on X, cached per account: who it follows (a priority hint on each
// candidate) and who it muted or blocked (never suggested). A run refreshes them at its start, at
// most once a day each; the filters read the mute and block cache without calling X.

/** The lists change slowly, so a run reads each at most once a day. */
export const LIST_REFRESH_MS = 24 * 60 * 60 * 1000;

const grants = (scope: string, list: XUserList): boolean =>
  scope.split(/\s+/).includes(X_USER_LISTS[list]);

const isFresh = (refreshedAt: Date | null, now: Date): boolean =>
  refreshedAt !== null && now.getTime() - refreshedAt.getTime() < LIST_REFRESH_MS;

function credentialsOf(accountId: string) {
  const account = getAccountCredentials(accountId);
  if (!account) throw new NotFoundError('Account not found.');
  return account;
}

/** The ids in `lists`, or null when X refused a read (over budget, throttled): the cache stays. */
async function readIds(accountId: string, lists: XUserList[]): Promise<Set<string> | null> {
  const ids = new Set<string>();
  try {
    for (const list of lists) {
      // oxlint-disable-next-line no-await-in-loop -- paid reads: each passes the cap check before the next sends
      for (const { id } of await getUserList(accountId, list, { feature: 'discovery' })) {
        ids.add(id);
      }
    }
  } catch (error) {
    if (error instanceof ServiceError) return null;
    throw error;
  }
  return ids;
}

/** Replaces one cache's rows and stamps its clock, in one write. */
function storeIds(
  accountId: string,
  table: typeof followedAccounts | typeof hiddenAuthors,
  clock: 'followingRefreshedAt' | 'hiddenAuthorsRefreshedAt',
  ids: Set<string>,
  now: Date,
): void {
  getDb().transaction((tx) => {
    tx.delete(table).where(eq(table.accountId, accountId)).run();
    if (ids.size > 0) {
      tx.insert(table)
        .values([...ids].map((userId) => ({ accountId, userId })))
        .run();
    }
    tx.update(xAccounts)
      .set({ [clock]: now })
      .where(eq(xAccounts.id, accountId))
      .run();
  });
}

function cachedFollowing(accountId: string): Set<string> {
  return new Set(
    getDb()
      .select({ userId: followedAccounts.userId })
      .from(followedAccounts)
      .where(eq(followedAccounts.accountId, accountId))
      .all()
      .map(({ userId }) => userId),
  );
}

/**
 * The accounts the user follows, as a set for the candidates' following flag. A linked account
 * whose grant predates `follows.read` gets null, and the run keeps going: the flag is a priority
 * hint, not a requirement. A failed refresh also gives null, and keeps the old cache.
 */
export async function followingFor(accountId: string, now: Date): Promise<Set<string> | null> {
  const account = credentialsOf(accountId);
  if (!grants(account.scope, 'following')) return null;
  if (isFresh(account.followingRefreshedAt, now)) return cachedFollowing(accountId);
  const ids = await readIds(accountId, ['following']);
  if (ids) storeIds(accountId, followedAccounts, 'followingRefreshedAt', ids, now);
  return ids;
}

/**
 * Reads the accounts the user muted or blocked on X into the cache the filters use, when it is
 * a day old. A grant without `mute.read` and `block.read` skips it: nothing is known, so nothing
 * extra is hidden. A refused read keeps the old cache: a stale list beats suggesting a muted
 * account.
 */
export async function refreshHiddenAuthors(accountId: string, now: Date): Promise<void> {
  const account = credentialsOf(accountId);
  if (!grants(account.scope, 'muting') || !grants(account.scope, 'blocking')) return;
  if (isFresh(account.hiddenAuthorsRefreshedAt, now)) return;
  const ids = await readIds(accountId, ['muting', 'blocking']);
  if (ids) storeIds(accountId, hiddenAuthors, 'hiddenAuthorsRefreshedAt', ids, now);
}
