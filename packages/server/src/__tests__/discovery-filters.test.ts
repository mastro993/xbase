import { DEFAULT_DISCOVERY_SETTINGS } from '@xbase/core/discovery';
import { NotFoundError, ValidationError } from '@xbase/core/errors';
import { discoveryCandidates, suggestedPosts } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSavedSearch, listCandidates } from '../discover';
import { getDiscoverySettings, saveDiscoverySettings } from '../discovery-settings';
import { runDiscovery } from '../discovery/fetch';
import { markCandidateReplied, muteCandidateAuthor, skipCandidate } from '../discovery/memory';
import type { Env } from '../env';
import {
  cacheFollowing,
  DAY_MS,
  HOME,
  NOW,
  page,
  SEARCH,
  seed,
  serve as serveX,
  type Tweet,
} from './discovery-run-stub';

// The filter stage of a run, the memory of what the owner decided, and the settings that
// re-check what is already stored. X is stubbed; the database is real.

const env = vi.hoisted(() => ({
  vars: {
    X_CLIENT_ID: 'client-id',
    X_CLIENT_SECRET: 'client-secret',
    APP_URL: 'http://127.0.0.1:5173',
  } as Partial<Env>,
}));
vi.mock('../env', () => ({ getEnv: () => env.vars }));

const HOUR_MS = 60 * 60 * 1000;
const fetchMock = vi.fn<typeof fetch>();

let db: ReturnType<typeof createTestDb>;
let accountId: string;

const serve = (routes: Record<string, unknown>, calls: URL[] = []) =>
  serveX(fetchMock, routes, calls);

/** One run reading `home` from the timeline and `found` from a saved search. */
async function run({ home = [], found = [] }: { home?: Tweet[]; found?: Tweet[] }) {
  serve({ [HOME]: page(home), [SEARCH]: page(found) });
  return runDiscovery(accountId);
}

const listed = (searchId: string) =>
  listCandidates(accountId, searchId).map(({ xPostId }) => xPostId);

const stored = () =>
  db
    .select({ xPostId: discoveryCandidates.xPostId, reason: discoveryCandidates.excludedReason })
    .from(discoveryCandidates)
    .orderBy(discoveryCandidates.xPostId)
    .all();

const candidateId = (xPostId: string) =>
  db
    .select({ id: discoveryCandidates.id })
    .from(discoveryCandidates)
    .where(eq(discoveryCandidates.xPostId, xPostId))
    .get()?.id ?? '';

const exclusions = (changes: Partial<typeof DEFAULT_DISCOVERY_SETTINGS.exclusions>) =>
  saveDiscoverySettings(accountId, 'exclusions', {
    ...DEFAULT_DISCOVERY_SETTINGS.exclusions,
    ...changes,
  });

let searchId: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = createTestDb();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  accountId = seed();
  cacheFollowing(accountId, []);
  searchId = createSavedSearch({ name: 'makers', query: 'saas' }).id;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a run’s filters', () => {
  it('stores each excluded post with its reason, and lists and counts only the rest', async () => {
    const result = await run({
      home: [{ id: 'h-bait', text: 'Like and repost if this helped' }, { id: 'h-keep' }],
      found: [
        { id: 's-crypto', text: 'Free airdrop tomorrow' },
        { id: 's-image', text: 'https://t.co/abc', mediaKeys: ['m1'] },
        { id: 's-keep', text: 'We hit $1k MRR' },
      ],
    });

    expect(stored()).toEqual([
      { xPostId: 'h-bait', reason: 'bait' },
      { xPostId: 'h-keep', reason: null },
      { xPostId: 's-crypto', reason: 'crypto' },
      { xPostId: 's-image', reason: 'image_only' },
      { xPostId: 's-keep', reason: null },
    ]);
    expect(result.excluded).toEqual([
      { xPostId: 'h-bait', reason: 'bait' },
      { xPostId: 's-crypto', reason: 'crypto' },
      { xPostId: 's-image', reason: 'image_only' },
    ]);
    expect(result.home).toBe(1);
    expect(result.searches).toEqual([{ id: searchId, name: 'makers', candidates: 1 }]);
    expect(listed(searchId)).toEqual(['s-keep']);
  });

  it('reports a post home and a search both returned once', async () => {
    const result = await run({
      home: [{ id: 'both', text: 'GIVEAWAY time' }],
      found: [{ id: 'both', text: 'GIVEAWAY time' }],
    });
    expect(result.excluded).toEqual([{ xPostId: 'both', reason: 'giveaway' }]);
  });

  it('counts a post home left out as off-topic once a search in the same run keeps it', async () => {
    saveDiscoverySettings(accountId, 'niches', { keywords: ['build in public'] });
    const post = { id: 'p', text: 'Our SaaS hit 1k MRR' };
    const result = await run({ home: [post], found: [post] });
    expect(result.excluded).toEqual([]);
    expect(result.home).toBe(0);
    expect(result.searches[0]?.candidates).toBe(1);
    expect(listed(searchId)).toEqual(['p']);
  });

  it('applies the niches to the home timeline only, wherever a search holds the post', async () => {
    saveDiscoverySettings(accountId, 'niches', { keywords: ['build in public'] });
    await run({ found: [{ id: 'cat', text: 'My cat sleeps' }] });
    // The timeline returns the search's post, and a home post outside the niches.
    const result = await run({
      home: [
        { id: 'cat', text: 'My cat sleeps' },
        { id: 'dog', text: 'My dog barks' },
      ],
    });
    expect(result.excluded).toEqual([{ xPostId: 'dog', reason: 'off_topic' }]);
    expect(stored()).toEqual([
      { xPostId: 'cat', reason: null },
      { xPostId: 'dog', reason: 'off_topic' },
    ]);
    expect(listed(searchId)).toEqual(['cat']);
  });

  it('drops a remembered post before storing it, run after run', async () => {
    await run({ found: [{ id: 'p1', text: 'First version' }] });
    skipCandidate(accountId, candidateId('p1'));

    const result = await run({ found: [{ id: 'p1', text: 'Edited version' }] });
    expect(result.dropped).toEqual([{ xPostId: 'p1', reason: 'remembered' }]);
    expect(result.searches[0]?.candidates).toBe(0);
    // The stored copy is left as it was, and stays hidden.
    expect(db.select({ text: discoveryCandidates.text }).from(discoveryCandidates).all()).toEqual([
      { text: 'First version' },
    ]);
    expect(listed(searchId)).toEqual([]);
  });
});

describe('the age cap', () => {
  it('is how far back a run reads X, and what a run keeps', async () => {
    saveDiscoverySettings(accountId, 'thresholds', {
      ...DEFAULT_DISCOVERY_SETTINGS.thresholds,
      bestAgeHours: 2,
      hardMaxAgeHours: 6,
    });
    const calls = serve({
      [HOME]: page([]),
      [SEARCH]: page([
        { id: 'fresh', createdAt: new Date(NOW.getTime() - 5 * HOUR_MS).toISOString() },
        { id: 'stale', createdAt: new Date(NOW.getTime() - 7 * HOUR_MS).toISOString() },
      ]),
    });

    const result = await runDiscovery(accountId);
    const sixHoursAgo = new Date(NOW.getTime() - 6 * HOUR_MS).toISOString();
    for (const url of calls.filter(({ pathname }) => pathname !== '/2/users/1001/following')) {
      expect(url.searchParams.get('start_time')).toBe(sixHoursAgo);
    }
    expect(result.dropped).toEqual([{ xPostId: 'stale', reason: 'too_old' }]);
    expect(listed(searchId)).toEqual(['fresh']);
  });

  it('never sends a search further back than X’s seven days', async () => {
    saveDiscoverySettings(accountId, 'thresholds', {
      ...DEFAULT_DISCOVERY_SETTINGS.thresholds,
      hardMaxAgeHours: 168,
    });
    const calls = serve({ [HOME]: page([]), [SEARCH]: page([]) });
    await runDiscovery(accountId);
    expect(calls.find(({ pathname }) => pathname === HOME)?.searchParams.get('start_time')).toBe(
      new Date(NOW.getTime() - 7 * DAY_MS).toISOString(),
    );
    expect(calls.find(({ pathname }) => pathname === SEARCH)?.searchParams.get('start_time')).toBe(
      new Date(NOW.getTime() - 7 * DAY_MS + 60_000).toISOString(),
    );
  });

  it('hides a stored candidate once it is older than the cap', async () => {
    await run({
      found: [{ id: 'p1', createdAt: new Date(NOW.getTime() - HOUR_MS).toISOString() }],
    });
    expect(listed(searchId)).toEqual(['p1']);
    vi.setSystemTime(new Date(NOW.getTime() + DAY_MS));
    expect(listed(searchId)).toEqual([]);
  });
});

describe('the owner’s decisions', () => {
  beforeEach(async () => {
    await run({
      found: [
        { id: 'p1', author_id: 'a2', username: 'Alice' },
        { id: 'p2', author_id: 'a2', username: 'Alice' },
        { id: 'p3', author_id: 'a3', username: 'bob' },
      ],
    });
  });

  const memory = () =>
    db
      .select({
        xPostId: suggestedPosts.xPostId,
        authorId: suggestedPosts.authorId,
        status: suggestedPosts.status,
        createdAt: suggestedPosts.createdAt,
      })
      .from(suggestedPosts)
      .all();

  it('skip and replied each hide one post, and remember it with its author', () => {
    skipCandidate(accountId, candidateId('p1'));
    markCandidateReplied(accountId, candidateId('p3'));
    expect(listed(searchId)).toEqual(['p2']);
    expect(memory()).toEqual([
      { xPostId: 'p1', authorId: 'a2', status: 'skipped', createdAt: NOW },
      { xPostId: 'p3', authorId: 'a3', status: 'replied', createdAt: NOW },
    ]);
  });

  it('keep a reply over a later skip, and the first time a post was remembered', () => {
    skipCandidate(accountId, candidateId('p1'));
    vi.setSystemTime(new Date(NOW.getTime() + HOUR_MS));
    markCandidateReplied(accountId, candidateId('p1'));
    skipCandidate(accountId, candidateId('p1'));
    expect(memory()).toEqual([
      { xPostId: 'p1', authorId: 'a2', status: 'replied', createdAt: NOW },
    ]);
  });

  it('mute hides every post of the author at once, and stays in the settings', () => {
    saveDiscoverySettings(accountId, 'watch', { accounts: ['alice', 'carol'], blocked: [] });
    muteCandidateAuthor(accountId, candidateId('p1'));
    expect(listed(searchId)).toEqual(['p3']);
    expect(getDiscoverySettings(accountId).watch).toEqual({
      accounts: ['carol'],
      blocked: ['alice'],
    });
    expect(stored().filter(({ reason }) => reason === 'blocked_author')).toHaveLength(2);
    // Muting again changes nothing.
    muteCandidateAuthor(accountId, candidateId('p2'));
    expect(getDiscoverySettings(accountId).watch.blocked).toEqual(['alice']);
  });

  it('mute says so when the never-suggest list is full', () => {
    const full = Array.from({ length: 100 }, (_, index) => `user${index}`);
    saveDiscoverySettings(accountId, 'watch', { accounts: [], blocked: full });
    expect(() => muteCandidateAuthor(accountId, candidateId('p1'))).toThrow(ValidationError);
    expect(() => muteCandidateAuthor(accountId, candidateId('p1'))).toThrow(/list is full \(100\)/);
    expect(new Set(listed(searchId))).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('act only on the account’s own candidates', () => {
    seedAccount({ id: '2002', username: 'other' });
    for (const act of [skipCandidate, markCandidateReplied, muteCandidateAuthor]) {
      expect(() => act('2002', candidateId('p1'))).toThrow(NotFoundError);
    }
    expect(memory()).toEqual([]);
  });
});

describe('a settings change', () => {
  beforeEach(async () => {
    await run({
      found: [
        { id: 'coin', text: 'New memecoin launch' },
        { id: 'saas', text: 'Our SaaS hit $1k', author_id: 'a2', username: 'alice' },
      ],
    });
  });

  it('re-checks the stored candidates when a filter is switched off and on', () => {
    expect(listed(searchId)).toEqual(['saas']);
    exclusions({ crypto: { ...DEFAULT_DISCOVERY_SETTINGS.exclusions.crypto, enabled: false } });
    expect(new Set(listed(searchId))).toEqual(new Set(['coin', 'saas']));
    exclusions({});
    expect(listed(searchId)).toEqual(['saas']);
  });

  it('hides an author blocked in Settings, and brings them back when removed', () => {
    saveDiscoverySettings(accountId, 'watch', { accounts: [], blocked: ['ALICE'] });
    expect(listed(searchId)).toEqual([]);
    saveDiscoverySettings(accountId, 'watch', { accounts: [], blocked: [] });
    expect(listed(searchId)).toEqual(['saas']);
  });

  it('leaves the candidates as they were when the save is rejected', () => {
    expect(() =>
      saveDiscoverySettings(accountId, 'watch', {
        accounts: [],
        blocked: ['alice', 'not a handle'],
      }),
    ).toThrow(ValidationError);
    expect(listed(searchId)).toEqual(['saas']);
  });
});
