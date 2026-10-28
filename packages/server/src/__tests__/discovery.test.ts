import { searchQueryForX } from '@xbase/core/discover';
import { discoveryCandidates, followedAccounts, savedSearches, xAccounts } from '@xbase/db/schema';
import { createTestDb } from '@xbase/db/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSavedSearch, listCandidates, listSavedSearches } from '../discover';
import { runDiscovery } from '../discovery/fetch';
import { LIST_REFRESH_MS } from '../discovery/relations';
import type { Env } from '../env';
import { getPosts } from '../x-api-client';
import {
  cacheLists,
  DAY_MS,
  FOLLOWING,
  HOME,
  NOW,
  page,
  reply,
  SEARCH,
  seed,
  serve as serveX,
  urlOf,
} from './discovery-run-stub';

const env = vi.hoisted(() => ({
  vars: {
    X_CLIENT_ID: 'client-id',
    X_CLIENT_SECRET: 'client-secret',
    APP_URL: 'http://127.0.0.1:5173',
  } as Partial<Env>,
}));
vi.mock('../env', () => ({ getEnv: () => env.vars }));

const fetchMock = vi.fn<typeof fetch>();

let db: ReturnType<typeof createTestDb>;
let accountId: string;

const cacheFollowing = (userIds: string[]) => cacheLists(accountId, userIds);
const serve = (routes: Record<string, unknown>, calls: URL[] = []) =>
  serveX(fetchMock, routes, calls);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = createTestDb();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  accountId = seed();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a discovery run', () => {
  it('reads one timeline page and every enabled search, and stamps each search', async () => {
    const enabled = createSavedSearch({ name: 'makers', query: 'buildinpublic' });
    const disabled = createSavedSearch({ name: 'off', query: 'paused' });
    db.update(savedSearches).set({ enabled: false }).where(eq(savedSearches.id, disabled.id)).run();
    cacheFollowing([]);

    serve({
      [HOME]: page([{ id: 'h1', author_id: 'a2', username: 'alice' }]),
      [SEARCH]: page([{ id: 's1', author_id: 'a3', username: 'bob' }]),
    });

    const run = await runDiscovery(accountId);
    expect(run).toMatchObject({ home: 1, stop: null });
    expect(run.searches).toEqual([{ id: enabled.id, name: 'makers', candidates: 1 }]);
    // One post is kept per source, and the disabled search was never read.
    expect(
      db
        .select()
        .from(discoveryCandidates)
        .all()
        .map(({ xPostId }) => xPostId),
    ).toEqual(['h1', 's1']);
    const searches = listSavedSearches(accountId);
    expect(searches.find(({ id }) => id === enabled.id)).toMatchObject({
      lastRunAt: NOW.toISOString(),
      lastCandidateCount: 1,
    });
    expect(searches.find(({ id }) => id === disabled.id)).toMatchObject({
      lastRunAt: null,
      lastCandidateCount: 0,
    });
    // The default page count is one, and no search was run for the disabled one.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks X for the last day, newest first, without replies or reposts', async () => {
    const search = createSavedSearch({ name: 'makers', query: 'buildinpublic' });
    cacheFollowing([]);
    const calls = serve({ [HOME]: page([]), [SEARCH]: page([]) });

    await runDiscovery(accountId);

    const home = calls.find((url) => url.pathname === HOME);
    expect(home?.searchParams.get('exclude')).toBe('replies,retweets');
    expect(home?.searchParams.get('start_time')).toBe(
      new Date(NOW.getTime() - DAY_MS).toISOString(),
    );
    expect(home?.searchParams.get('max_results')).toBe('25');

    const query = calls.find((url) => url.pathname === SEARCH);
    expect(query?.searchParams.get('query')).toBe(searchQueryForX(search.query));
    expect(query?.searchParams.get('query')).toBe('(buildinpublic) -is:reply -is:retweet');
    expect(query?.searchParams.get('sort_order')).toBe('recency');
    expect(query?.searchParams.get('start_time')).toBe(
      new Date(NOW.getTime() - DAY_MS).toISOString(),
    );
    expect(query?.searchParams.get('max_results')).toBe('25');
  });

  it('stores a long post in full and the post it quotes, then reads neither again', async () => {
    createSavedSearch({ name: 'makers', query: 'longpost' });
    cacheFollowing([]);
    serve({
      [HOME]: page([]),
      [SEARCH]: page(
        [
          {
            id: 'p1',
            author_id: 'a2',
            username: 'alice',
            text: 'The short preview…',
            note_tweet: { text: 'The whole long post, with the ending X hides.' },
            references: [{ type: 'quoted', id: 'q1' }],
          },
        ],
        [
          {
            id: 'q1',
            author_id: 'a3',
            username: 'bob',
            text: 'Quoted preview…',
            note_tweet: { text: 'The quoted post, in full.' },
          },
        ],
      ),
    });

    await runDiscovery(accountId);

    const [candidate] = db.select().from(discoveryCandidates).all();
    expect(candidate).toMatchObject({
      xPostId: 'p1',
      text: 'The whole long post, with the ending X hides.',
      isQuote: true,
      quotedPostId: 'q1',
      quotedText: 'The quoted post, in full.',
      quotedAuthorHandle: 'bob',
    });

    // The same post read again inside the cache window comes from the database: no new call.
    const callsBefore = fetchMock.mock.calls.length;
    const again = await getPosts(accountId, ['p1', 'q1'], { feature: 'full_text' });
    expect(again.cached).toBe(2);
    expect(again.posts[0]?.text).toBe('The whole long post, with the ending X hides.');
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('drops replies, reposts and posts older than a day that X returned anyway', async () => {
    createSavedSearch({ name: 'makers', query: 'mixed' });
    cacheFollowing([]);
    const old = new Date(NOW.getTime() - DAY_MS - 1_000).toISOString();
    serve({
      [HOME]: page([]),
      [SEARCH]: page([
        { id: 'reply', references: [{ type: 'replied_to', id: 'x' }] },
        { id: 'repost', references: [{ type: 'retweeted', id: 'y' }] },
        { id: 'old', createdAt: old },
        { id: 'keep' },
      ]),
    });

    const run = await runDiscovery(accountId);
    expect(run.dropped).toEqual([
      { xPostId: 'reply', reason: 'reply' },
      { xPostId: 'repost', reason: 'repost' },
      { xPostId: 'old', reason: 'too_old' },
    ]);
    expect(
      db
        .select()
        .from(discoveryCandidates)
        .all()
        .map(({ xPostId }) => xPostId),
    ).toEqual(['keep']);
    expect(listCandidates(accountId, listSavedSearches(accountId)[0]?.id ?? '')).toHaveLength(1);
  });

  it('keeps a post with the saved search that found it, even when the timeline returns it too', async () => {
    const search = createSavedSearch({ name: 'makers', query: 'mixed' });
    cacheFollowing([]);
    let homeCalls = 0;
    let searchCalls = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.pathname === HOME) {
        homeCalls += 1;
        return reply(
          homeCalls === 1 ? page([{ id: 'home' }]) : page([{ id: 'home' }, { id: 'found' }]),
        );
      }
      searchCalls += 1;
      return reply(
        searchCalls === 1 ? page([{ id: 'found' }]) : page([{ id: 'found' }, { id: 'home' }]),
      );
    });

    await runDiscovery(accountId);
    let rows = db.select().from(discoveryCandidates).all();
    expect(rows.find(({ xPostId }) => xPostId === 'home')?.savedSearchId).toBeNull();
    expect(rows.find(({ xPostId }) => xPostId === 'found')?.savedSearchId).toBe(search.id);

    // The home timeline can't take a search's post back; a search does claim a post home found.
    await runDiscovery(accountId);
    rows = db.select().from(discoveryCandidates).all();
    expect(rows.find(({ xPostId }) => xPostId === 'home')?.savedSearchId).toBe(search.id);
    expect(rows.find(({ xPostId }) => xPostId === 'found')?.savedSearchId).toBe(search.id);
  });

  it('counts only the posts the search ends up owning', async () => {
    const first = createSavedSearch({ name: 'a', query: 'first' });
    const second = createSavedSearch({ name: 'b', query: 'second' });
    cacheFollowing([]);
    serve({
      [HOME]: page([]),
      // Both searches match the same post; the first one to run owns it.
      [SEARCH]: page([{ id: 'shared', author_id: 'a2', username: 'alice' }]),
    });

    await runDiscovery(accountId);
    const searches = listSavedSearches(accountId);
    expect(searches.find(({ id }) => id === first.id)?.lastCandidateCount).toBe(1);
    expect(searches.find(({ id }) => id === second.id)?.lastCandidateCount).toBe(0);
    expect(listCandidates(accountId, first.id).map(({ xPostId }) => xPostId)).toEqual(['shared']);
    expect(listCandidates(accountId, second.id)).toEqual([]);
  });

  it('marks a post by a followed author, and keeps it', async () => {
    createSavedSearch({ name: 'makers', query: 'mixed' });
    cacheFollowing(['a2']);
    serve({
      [HOME]: page([]),
      [SEARCH]: page([
        { id: 'followed', author_id: 'a2', username: 'alice' },
        { id: 'stranger', author_id: 'a3', username: 'bob' },
      ]),
    });

    await runDiscovery(accountId);
    const rows = db.select().from(discoveryCandidates).all();
    expect(rows.find(({ xPostId }) => xPostId === 'followed')?.authorFollowing).toBe(true);
    expect(rows.find(({ xPostId }) => xPostId === 'stranger')?.authorFollowing).toBe(false);
  });

  it('reads and caches the follow list when the cache is older than a day', async () => {
    cacheFollowing(['stale']);
    db.update(xAccounts)
      .set({ followingRefreshedAt: new Date(NOW.getTime() - LIST_REFRESH_MS - 1) })
      .where(eq(xAccounts.id, accountId))
      .run();
    createSavedSearch({ name: 'makers', query: 'mixed' });
    const calls = serve({
      [FOLLOWING]: { data: [{ id: 'a2', username: 'alice', name: 'Alice' }] },
      [HOME]: page([]),
      [SEARCH]: page([{ id: 'p1', author_id: 'a2', username: 'alice' }]),
    });

    await runDiscovery(accountId);
    expect(calls.filter((url) => url.pathname === FOLLOWING)).toHaveLength(1);
    expect(db.select().from(discoveryCandidates).get()?.authorFollowing).toBe(true);
    expect(
      db
        .select()
        .from(followedAccounts)
        .all()
        .map(({ userId }) => userId),
    ).toEqual(['a2']);

    // The refreshed list answers the next run without a call.
    await runDiscovery(accountId);
    expect(calls.filter((url) => url.pathname === FOLLOWING)).toHaveLength(1);
  });

  it('keeps the following flag unknown when the grant lacks follows.read', async () => {
    db.update(xAccounts)
      .set({ scope: 'tweet.read users.read offline.access' })
      .where(eq(xAccounts.id, accountId))
      .run();
    createSavedSearch({ name: 'makers', query: 'mixed' });
    const calls = serve({
      [HOME]: page([]),
      [SEARCH]: page([{ id: 'p1', author_id: 'a2', username: 'alice' }]),
    });

    await runDiscovery(accountId);
    expect(calls.some((url) => url.pathname === FOLLOWING)).toBe(false);
    expect(db.select().from(discoveryCandidates).get()?.authorFollowing).toBeNull();
  });

  it('reports a timeline 429 and still reads the searches, which use another endpoint', async () => {
    const search = createSavedSearch({ name: 'makers', query: 'mixed' });
    cacheFollowing([]);
    const reset = new Date(NOW.getTime() + 15 * 60_000);
    fetchMock.mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.pathname === HOME) {
        return reply(
          { title: 'Too Many Requests' },
          {
            status: 429,
            headers: {
              'x-rate-limit-remaining': '0',
              'x-rate-limit-reset': String(reset.getTime() / 1000),
            },
          },
        );
      }
      return reply(page([{ id: 'p1', author_id: 'a2', username: 'alice' }]));
    });

    const run = await runDiscovery(accountId);
    expect(run.home).toBe(0);
    expect(run.stop).toMatchObject({ reason: 'rate_limit', savedSearchId: null });
    expect(run.searches).toEqual([{ id: search.id, name: 'makers', candidates: 1 }]);
    expect(listCandidates(accountId, search.id)).toHaveLength(1);
  });

  it('stops at a rate limit, keeping what it read and naming the search that hit it', async () => {
    const first = createSavedSearch({ name: 'a', query: 'first' });
    createSavedSearch({ name: 'b', query: 'second' });
    cacheFollowing([]);
    const reset = new Date(NOW.getTime() + 15 * 60_000);
    let searches = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.pathname === HOME) return reply(page([]));
      searches += 1;
      if (searches === 1) return reply(page([]));
      return reply(
        { title: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'x-rate-limit-remaining': '0',
            'x-rate-limit-reset': String(reset.getTime() / 1000),
          },
        },
      );
    });

    const run = await runDiscovery(accountId);
    expect(run.searches).toEqual([{ id: first.id, name: 'a', candidates: 0 }]);
    expect(run.stop).toMatchObject({
      reason: 'rate_limit',
      savedSearchId: listSavedSearches(accountId).find(({ name }) => name === 'b')?.id,
    });
    const second = listSavedSearches(accountId).find(({ name }) => name === 'b');
    expect(second?.lastRunAt).toBeNull();
    // Two searches were attempted; the third source never ran.
    expect(searches).toBe(2);
  });
});
