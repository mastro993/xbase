import type { DiscoverySettings } from '@xbase/core/discovery';
import { compileExclusions, type ExclusionReason } from '@xbase/core/discovery-filters';
import { getDb } from '@xbase/db/client';
import { discoveryCandidates, hiddenAuthors } from '@xbase/db/schema';
import { and, eq, gte } from 'drizzle-orm';

// The filter stage: which stored candidates the lists leave out, and why. A run applies the same
// rules to each page it stores (fetch.ts); this re-applies them when the settings change, so a
// switch turned off or an author blocked counts at once rather than when X returns the post again.

const HOUR_MS = 60 * 60 * 1000;

/** The oldest post the account still wants: its hard age cap, counted back from `now`. */
export const oldestWanted = (settings: DiscoverySettings, now: Date): Date =>
  new Date(now.getTime() - settings.thresholds.hardMaxAgeHours * HOUR_MS);

/**
 * The X user ids the account muted or blocked, as the last run cached them (relations.ts): the
 * filters read the cache, never X.
 */
export function cachedHiddenAuthors(accountId: string): Set<string> {
  return new Set(
    getDb()
      .select({ userId: hiddenAuthors.userId })
      .from(hiddenAuthors)
      .where(eq(hiddenAuthors.accountId, accountId))
      .all()
      .map(({ userId }) => userId),
  );
}

/**
 * Recomputes the reason of every candidate young enough to be listed; older ones are hidden by
 * age whatever their reason. Writes only the rows whose verdict changed. Runs inside the caller's
 * transaction, with the settings just saved.
 */
export function refilterCandidates(
  accountId: string,
  settings: DiscoverySettings,
  now: Date,
): void {
  const db = getDb();
  const exclusionOf = compileExclusions(settings, cachedHiddenAuthors(accountId));
  const rows = db
    .select()
    .from(discoveryCandidates)
    .where(
      and(
        eq(discoveryCandidates.accountId, accountId),
        gte(discoveryCandidates.postedAt, oldestWanted(settings, now)),
      ),
    )
    .all();
  for (const row of rows) {
    const reason: ExclusionReason | null = exclusionOf(row);
    if (reason === row.excludedReason) continue;
    db.update(discoveryCandidates)
      .set({ excludedReason: reason })
      .where(eq(discoveryCandidates.id, row.id))
      .run();
  }
}
