import { searchQueryForX } from '@xbase/core/discover';
import {
  BudgetExceededError,
  NotFoundError,
  RateLimitedError,
  ReconnectRequiredError,
  ServiceError,
} from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import {
  discoveryCandidates,
  followedAccounts,
  savedSearchRuns,
  savedSearches,
  xAccounts,
} from '@xbase/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getAccountCredentials } from '../accounts';
import { getFollowing, homeTimeline, searchRecent, type XTimelineStop } from '../x-api-client';
import {
  type CandidateRow,
  candidatesFromPage,
  type DroppedPost,
  MAX_CANDIDATE_AGE_MS,
} from './candidates';

// One discovery run: the account's home timeline plus every enabled saved search, read through
// x-api-client.ts so every paid page passes the budget, the 429 wait and the post cache. The run
// stores candidates and stamps each search it read; nothing schedules it yet (#16 will).

/** The follow list changes slowly, so a run reads it at most once a day. */
export const FOLLOWING_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Why a run stopped before reading every source, and the message the page shows. */
export type DiscoveryStop = {
  reason: 'budget' | 'rate_limit' | 'reconnect';
  message: string;
  /** The saved search that hit it; null when the home timeline did. */
  savedSearchId: string | null;
};

export type SearchRun = { id: string; name: string; candidates: number };

/** What a run read and kept: the page's summary, and what #16 logs. */
export type DiscoveryRun = {
  startedAt: string;
  /** How many candidates the home timeline produced. */
  home: number;
  /** One entry per search the run read, in list order. */
  searches: SearchRun[];
  /** The posts a source returned and the run threw away. */
  dropped: DroppedPost[];
  stop: DiscoveryStop | null;
};

const followsScope = (scope: string): boolean =>
  scope
    .split(/\s+/)
    .map((value) => value.trim())
    .includes('follows.read');

/** The ids the account follows now, in the cache, or null when an old grant can't read them. */
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
 * hint, not a requirement. The list is cached for a day; a failed refresh keeps the old one.
 */
async function followingFor(accountId: string, now: Date): Promise<Set<string> | null> {
  const account = getAccountCredentials(accountId);
  if (!account) throw new NotFoundError('Account not found.');
  if (!followsScope(account.scope)) return null;

  const fresh =
    account.followingRefreshedAt !== null &&
    now.getTime() - account.followingRefreshedAt.getTime() < FOLLOWING_REFRESH_MS;
  if (fresh) return cachedFollowing(accountId);

  let follows: { id: string }[];
  try {
    follows = await getFollowing(accountId, { feature: 'discovery' });
  } catch (error) {
    // X being over budget or throttled leaves the flag unknown, not the run dead: the posts read
    // from another source still matter. The old cache stays as it was.
    if (error instanceof ServiceError) return null;
    throw error;
  }

  const db = getDb();
  db.transaction((tx) => {
    tx.delete(followedAccounts).where(eq(followedAccounts.accountId, accountId)).run();
    if (follows.length > 0) {
      tx.insert(followedAccounts)
        .values(follows.map(({ id }) => ({ accountId, userId: id })))
        .run();
    }
    tx.update(xAccounts)
      .set({ followingRefreshedAt: now })
      .where(eq(xAccounts.id, accountId))
      .run();
  });
  return new Set(follows.map(({ id }) => id));
}

/**
 * The latest copy of each post: a repeat read refreshes its text, metrics and fetched time rather
 * than adding a second row. The first saved search to find a post keeps it, so a later home
 * timeline page can't take a post off the search's list; a home candidate a search finds later
 * moves to that search, which is where the page shows it.
 */
function storeCandidates(accountId: string, rows: CandidateRow[]): void {
  if (rows.length === 0) return;
  const db = getDb();
  db.transaction((tx) => {
    for (const row of rows) {
      const values = { accountId, ...row };
      tx.insert(discoveryCandidates)
        .values(values)
        .onConflictDoUpdate({
          target: [discoveryCandidates.accountId, discoveryCandidates.xPostId],
          set: {
            ...values,
            source: sql`case when ${discoveryCandidates.savedSearchId} is null then ${row.source} else ${discoveryCandidates.source} end`,
            savedSearchId: sql`coalesce(${discoveryCandidates.savedSearchId}, ${row.savedSearchId})`,
          },
        })
        .run();
    }
  });
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

/**
 * How many of a run's posts this search actually holds. A post an earlier search already owns
 * stays with it, so counting every returned post would promise candidates the page never lists.
 */
function ownedCount(accountId: string, savedSearchId: string, postIds: string[]): number {
  if (postIds.length === 0) return 0;
  return getDb()
    .select({ id: discoveryCandidates.xPostId })
    .from(discoveryCandidates)
    .where(
      and(
        eq(discoveryCandidates.accountId, accountId),
        eq(discoveryCandidates.savedSearchId, savedSearchId),
        inArray(discoveryCandidates.xPostId, postIds),
      ),
    )
    .all().length;
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
 * target: fresh original and quote posts, in full, from accounts outside the follow list too.
 * Searches and the timeline filter at X as well, so a dropped post is rarely billed. X throttles
 * per endpoint, so a timeline rate limit still lets the searches run; a budget or a rejected
 * grant belongs to the account, and stops everything.
 */
export async function runDiscovery(accountId: string): Promise<DiscoveryRun> {
  const startedAt = new Date();
  const since = new Date(startedAt.getTime() - MAX_CANDIDATE_AGE_MS);
  const following = await followingFor(accountId, startedAt);
  const dropped: DroppedPost[] = [];

  let stop: DiscoveryStop | null = null;
  let homeKept = 0;
  try {
    const home = await homeTimeline(accountId, { feature: 'discovery', since });
    const homePage = candidatesFromPage(
      { posts: home.posts, users: home.users },
      { source: 'home', following, now: startedAt },
    );
    storeCandidates(accountId, homePage.candidates);
    dropped.push(...homePage.dropped);
    homeKept = homePage.candidates.length;
    stop = stopOf(home.stop);
  } catch (error) {
    // The first timeline page failed: report it and read the searches, which use another endpoint.
    if (!isStop(error)) throw error;
    stop = searchStop(error, null);
  }

  const searches: SearchRun[] = [];
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
        now: startedAt,
      });
      storeCandidates(accountId, result.candidates);
      const candidates = ownedCount(
        accountId,
        search.id,
        result.candidates.map(({ xPostId }) => xPostId),
      );
      stampSearch(accountId, search.id, new Date(), candidates);
      dropped.push(...result.dropped);
      searches.push({ id: search.id, name: search.name, candidates });
    } catch (error) {
      // Every search shares one endpoint, so after a 429 the rest would hit the same wall.
      if (!isStop(error)) throw error;
      stop = searchStop(error, search.id);
      break;
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    home: homeKept,
    searches,
    dropped,
    stop,
  };
}
