import { searchQueryForX } from '@xbase/core/discover';
import { compileExclusions, type ExclusionReason } from '@xbase/core/discovery-filters';
import {
  BudgetExceededError,
  RateLimitedError,
  ReconnectRequiredError,
  type ServiceError,
} from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import { discoveryCandidates, savedSearchRuns, savedSearches } from '@xbase/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDiscoverySettings } from '../discovery-settings';
import { homeTimeline, searchRecent, type XTimelineStop } from '../x-api-client';
import { type CandidateRow, candidatesFromPage, type DroppedPost } from './candidates';
import { cachedHiddenAuthors, oldestWanted } from './filter';
import { rememberedAmong } from './memory';
import { followingFor, refreshHiddenAuthors } from './relations';

// One discovery run: the account's home timeline plus every enabled saved search, read through
// x-api-client.ts so every paid page passes the budget, the 429 wait and the post cache. The run
// filters and stores candidates and stamps each search it read; nothing schedules it yet (#16 will).

/** Why a run stopped before reading every source, and the message the page shows. */
type DiscoveryStop = {
  reason: 'budget' | 'rate_limit' | 'reconnect';
  message: string;
  /** The saved search that hit it; null when the home timeline did. */
  savedSearchId: string | null;
};

type SearchRun = { id: string; name: string; candidates: number };

/** A post the run stored but the filters keep out of the lists, and the rule that did. */
type ExcludedPost = { xPostId: string; reason: ExclusionReason };

/** What a run read and kept: the page's summary, and what #16 logs. */
export type DiscoveryRun = {
  startedAt: string;
  /** How many listed candidates the home timeline produced, beyond those a search holds. */
  home: number;
  /** One entry per search the run read, in list order. */
  searches: SearchRun[];
  /** The posts a source returned and the run threw away. */
  dropped: DroppedPost[];
  /** The posts it stored for the filters to keep out, once each. */
  excluded: ExcludedPost[];
  stop: DiscoveryStop | null;
};

/** A listed post, and the saved search that holds it (null for a home candidate). */
type KeptPost = { xPostId: string; savedSearchId: string | null };

/** What one page left in the lists, what the filters keep out, and what was already decided. */
type StoredPage = { kept: KeptPost[]; excluded: ExcludedPost[]; remembered: string[] };

/** The saved search that already holds each of these posts, when one does. */
function searchOwners(accountId: string, xPostIds: string[]): Map<string, string> {
  const rows = getDb()
    .select({
      xPostId: discoveryCandidates.xPostId,
      savedSearchId: discoveryCandidates.savedSearchId,
    })
    .from(discoveryCandidates)
    .where(
      and(
        eq(discoveryCandidates.accountId, accountId),
        // Only the page's ids: an `is not null` here would walk every search's history instead.
        inArray(discoveryCandidates.xPostId, xPostIds),
      ),
    )
    .all();
  return new Map(
    rows.flatMap(({ xPostId, savedSearchId }) => (savedSearchId ? [[xPostId, savedSearchId]] : [])),
  );
}

/**
 * The latest copy of each post: a repeat read refreshes its text, metrics, fetched time and the
 * filters' verdict rather than adding a second row. The first saved search to find a post keeps
 * it, so a later home timeline page can't take a post off the search's list; a home candidate a
 * search finds later moves to that search, which is where the page shows it.
 *
 * A post the account already remembers is left as it was. The settings, the memory and the
 * owners are read here, with no await before the write, so a mute or a skip during the run
 * applies to its later pages too.
 */
function storeCandidates(accountId: string, rows: CandidateRow[]): StoredPage {
  const page: StoredPage = { kept: [], excluded: [], remembered: [] };
  if (rows.length === 0) return page;
  const ids = rows.map(({ xPostId }) => xPostId);
  const exclusionOf = compileExclusions(
    getDiscoverySettings(accountId),
    cachedHiddenAuthors(accountId),
  );
  const remembered = rememberedAmong(accountId, ids);
  const owners = searchOwners(accountId, ids);
  getDb().transaction((tx) => {
    for (const row of rows) {
      if (remembered.has(row.xPostId)) {
        page.remembered.push(row.xPostId);
        continue;
      }
      const owner = owners.get(row.xPostId);
      const placed = owner ? { ...row, source: 'search' as const, savedSearchId: owner } : row;
      // Judged where it is listed: the niches only apply to the home timeline.
      const excludedReason = exclusionOf(placed);
      if (excludedReason) page.excluded.push({ xPostId: row.xPostId, reason: excludedReason });
      else page.kept.push({ xPostId: row.xPostId, savedSearchId: placed.savedSearchId });
      const values = { accountId, ...placed, excludedReason };
      tx.insert(discoveryCandidates)
        .values(values)
        .onConflictDoUpdate({
          target: [discoveryCandidates.accountId, discoveryCandidates.xPostId],
          set: values,
        })
        .run();
    }
  });
  return page;
}

/** The run is the account's: saved searches are shared, but another account's candidates aren't. */
function stampSearch(accountId: string, id: string, at: Date, candidates: number): void {
  const values = { accountId, savedSearchId: id, lastRunAt: at, lastCandidateCount: candidates };
  getDb()
    .insert(savedSearchRuns)
    .values(values)
    .onConflictDoUpdate({
      target: [savedSearchRuns.accountId, savedSearchRuns.savedSearchId],
      set: values,
    })
    .run();
}

/** The searches a run reads, in the order Discover lists them. */
function enabledSearches(): { id: string; name: string; query: string }[] {
  return getDb()
    .select({ id: savedSearches.id, name: savedSearches.name, query: savedSearches.query })
    .from(savedSearches)
    .where(eq(savedSearches.enabled, true))
    .orderBy(asc(savedSearches.name), asc(savedSearches.createdAt))
    .all();
}

const stopOf = (home: XTimelineStop | null): DiscoveryStop | null =>
  home === null ? null : { reason: home.reason, message: home.message, savedSearchId: null };

/** A stop a paid read raised: the timeline when `savedSearchId` is null, else that search. */
function searchStop(error: ServiceError, savedSearchId: string | null): DiscoveryStop {
  const reason =
    error instanceof BudgetExceededError
      ? 'budget'
      : error instanceof RateLimitedError
        ? 'rate_limit'
        : 'reconnect';
  return { reason, message: error.message, savedSearchId };
}

const isStop = (
  error: unknown,
): error is BudgetExceededError | RateLimitedError | ReconnectRequiredError =>
  error instanceof BudgetExceededError ||
  error instanceof RateLimitedError ||
  error instanceof ReconnectRequiredError;

/**
 * Reads one home timeline page plus every enabled saved search, and stores what a reply could
 * target: fresh original and quote posts, in full, from accounts outside the follow list too,
 * each with the filters' verdict. Posts the account already decided on are dropped. Searches and
 * the timeline filter at X as well, so a dropped post is rarely billed. X throttles per endpoint,
 * so a timeline rate limit still lets the searches run; a budget or a rejected grant belongs to
 * the account, and stops everything.
 */
export async function runDiscovery(accountId: string): Promise<DiscoveryRun> {
  const startedAt = new Date();
  // The hard age cap is also how far back the run reads: X then never bills an older post.
  const since = oldestWanted(getDiscoverySettings(accountId), startedAt);
  const following = await followingFor(accountId, startedAt);
  await refreshHiddenAuthors(accountId, startedAt);
  const dropped: DroppedPost[] = [];
  // By post: home and a search can return the same one.
  const excluded = new Map<string, ExclusionReason>();
  const store = (rows: CandidateRow[]): KeptPost[] => {
    const page = storeCandidates(accountId, rows);
    // The last verdict counts: a search keeps a post the home timeline left out as off-topic.
    for (const { xPostId, reason } of page.excluded) excluded.set(xPostId, reason);
    for (const { xPostId } of page.kept) excluded.delete(xPostId);
    dropped.push(...page.remembered.map((xPostId) => ({ xPostId, reason: 'remembered' as const })));
    return page.kept;
  };
  const heldBy = (kept: KeptPost[], savedSearchId: string | null): string[] =>
    kept.filter((post) => post.savedSearchId === savedSearchId).map(({ xPostId }) => xPostId);

  let stop: DiscoveryStop | null = null;
  let homeKept: string[] = [];
  try {
    const home = await homeTimeline(accountId, { feature: 'discovery', since });
    const homePage = candidatesFromPage(
      { posts: home.posts, users: home.users },
      { source: 'home', following, since },
    );
    dropped.push(...homePage.dropped);
    homeKept = heldBy(store(homePage.candidates), null);
    stop = stopOf(home.stop);
  } catch (error) {
    // The first timeline page failed: report it and read the searches, which use another endpoint.
    if (!isStop(error)) throw error;
    stop = searchStop(error, null);
  }

  const searches: SearchRun[] = [];
  const searchHeld = new Set<string>();
  for (const search of enabledSearches()) {
    if (stop?.reason === 'budget' || stop?.reason === 'reconnect') break;
    try {
      // oxlint-disable-next-line no-await-in-loop -- searches are paid calls: each passes the cap check before the next sends
      const page = await searchRecent(accountId, searchQueryForX(search.query), {
        feature: 'discovery',
        since,
      });
      const result = candidatesFromPage(page, {
        source: 'search',
        savedSearchId: search.id,
        following,
        since,
      });
      dropped.push(...result.dropped);
      // A post an earlier search already holds stays with it, and counts there.
      const held = heldBy(store(result.candidates), search.id);
      for (const id of held) searchHeld.add(id);
      stampSearch(accountId, search.id, new Date(), held.length);
      searches.push({ id: search.id, name: search.name, candidates: held.length });
    } catch (error) {
      // Every search shares one endpoint, so after a 429 the rest would hit the same wall.
      if (!isStop(error)) throw error;
      stop = searchStop(error, search.id);
      break;
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    // A home candidate a search also found moved to that search, and counts there.
    home: homeKept.filter((id) => !searchHeld.has(id)).length,
    searches,
    dropped,
    excluded: [...excluded].map(([xPostId, reason]) => ({ xPostId, reason })),
    stop,
  };
}
