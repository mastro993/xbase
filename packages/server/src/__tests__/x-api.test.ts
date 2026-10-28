import {
  BudgetExceededError,
  RateLimitedError,
  ReconnectRequiredError,
  ValidationError,
} from '@xbase/core/errors';
import {
  estimateHomeTimelineCostMicros,
  estimateReadCostMicros,
  X_SEARCH_RESULTS_PER_CALL,
  type XApiSettings,
} from '@xbase/core/x-api';
import { xAccounts, xApiCalls, xPosts, xRateLimits } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getAccountCredentials, listAccounts, saveAccount, saveAccountTokens } from '../accounts';
import { getDiscoverySettings, saveDiscoverySettings } from '../discovery-settings';
import type { Env } from '../env';
import { getPosts, getUserList, getUsers, homeTimeline, searchRecent } from '../x-api-client';
import { getXApiSettings, saveXApiSection, saveXApiSettings } from '../x-api-settings';
import {
  assertBudget,
  getSpend,
  getXApiUsage,
  recordXApiCall,
  saveRateLimits,
} from '../x-api-usage';

const NOW = new Date('2026-10-27T15:00:00.000Z');

const env = vi.hoisted(() => ({
  vars: {
    X_CLIENT_ID: 'client-id',
    X_CLIENT_SECRET: 'client-secret',
    APP_URL: 'http://127.0.0.1:5173',
  } as Partial<Env>,
}));
vi.mock('../env', () => ({ getEnv: () => env.vars }));

const fetchMock = vi.fn<typeof fetch>();

/** The URL of a fetch call, whichever of the three shapes fetch accepts. */
const callUrl = (index = 0): URL => {
  const input = fetchMock.mock.calls[index]?.[0];
  if (!input) throw new Error(`No fetch call at ${index}.`);
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
};

const reply = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
};

type Tweet = {
  id: string;
  text?: string;
  author_id?: string;
  username?: string;
  /** A long post's body; `text` is then the truncated preview. */
  note_tweet?: { text: string };
  /** The id of the post this one quotes. */
  quotes?: string;
};

const asTweet = (tweet: Tweet) => ({
  id: tweet.id,
  text: tweet.text ?? `Post ${tweet.id}`,
  author_id: tweet.author_id,
  created_at: '2026-10-27T12:00:00.000Z',
  public_metrics: {
    like_count: 1,
    reply_count: 0,
    retweet_count: 0,
    quote_count: 0,
  },
  ...(tweet.note_tweet ? { note_tweet: tweet.note_tweet } : {}),
  ...(tweet.quotes ? { referenced_tweets: [{ type: 'quoted', id: tweet.quotes }] } : {}),
});

/** A /2/tweets or search answer, with the authors and quoted posts in includes. */
function postPage(tweets: Tweet[], options: { nextToken?: string; quoted?: Tweet[] } = {}) {
  const authors = new Map<string, { id: string; username: string; name: string }>();
  for (const tweet of [...tweets, ...(options.quoted ?? [])]) {
    if (!tweet.author_id) continue;
    authors.set(tweet.author_id, {
      id: tweet.author_id,
      username: tweet.username ?? `user${tweet.author_id}`,
      name: `User ${tweet.author_id}`,
    });
  }
  return {
    data: tweets.map(asTweet),
    includes: {
      users: [...authors.values()],
      ...(options.quoted ? { tweets: options.quoted.map(asTweet) } : {}),
    },
    meta: options.nextToken ? { next_token: options.nextToken } : {},
  };
}

let db: ReturnType<typeof createTestDb>;

const seed = (id: string, username: string, expiresInSeconds = 7200) => {
  seedAccount({ id, username });
  saveAccountTokens(id, {
    accessToken: `access-${id}`,
    refreshToken: `refresh-${id}`,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    scope: 'tweet.read users.read offline.access',
  });
  return id;
};

type SettingsOverrides = {
  budget?: Partial<XApiSettings['budget']>;
  cache?: Partial<XApiSettings['cache']>;
};

const settings = (overrides: SettingsOverrides = {}): XApiSettings => ({
  budget: { dailyCapUsd: null, monthlyCapUsd: null, ...overrides.budget },
  cache: { windowMinutes: 60, ...overrides.cache },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = createTestDb();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cost estimation', () => {
  it('prices own and other reads separately and adds them exactly', () => {
    expect(estimateReadCostMicros({})).toBe(0);
    expect(estimateReadCostMicros({ ownItems: 2, otherItems: 3 })).toBe(17_000);
    expect(estimateReadCostMicros({ ownItems: -5, otherItems: 1 })).toBe(5_000);
    // One home-timeline page is up to 25 posts by others.
    expect(estimateHomeTimelineCostMicros(1)).toBe(125_000);
    expect(estimateHomeTimelineCostMicros(3)).toBe(375_000);
  });
});

describe('usage log', () => {
  it('stores the settings one section at a time over the defaults', () => {
    saveXApiSettings(settings({ budget: { dailyCapUsd: 1 }, cache: { windowMinutes: 15 } }));
    expect(getXApiSettings()).toEqual(
      settings({ budget: { dailyCapUsd: 1 }, cache: { windowMinutes: 15 } }),
    );

    saveXApiSection('cache', { windowMinutes: 30 });
    expect(getXApiSettings()).toEqual(
      settings({ budget: { dailyCapUsd: 1 }, cache: { windowMinutes: 30 } }),
    );
  });

  it('records one row per call with its endpoint, items, cost, feature and account', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(
      reply(
        postPage([
          { id: '1', author_id: '2002' },
          { id: '2', author_id: '2002' },
          { id: '3', author_id: '1001' },
        ]),
      ),
    );

    const result = await getPosts(accountId, ['1', '2', '3'], { feature: 'full_text' });
    expect(result.cached).toBe(0);

    const calls = db.select().from(xApiCalls).all();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'full_text',
      itemCount: 3,
      costMicros: 11_000,
      status: 'ok',
    });
    expect(calls[0]?.createdAt).toEqual(NOW);
  });

  it('keeps the short and 24-hour rate-limit windows X reports', () => {
    const accountId = seed('1001', 'owner');
    saveRateLimits(
      accountId,
      'GET /2/tweets',
      new Headers({
        'x-rate-limit-limit': '300',
        'x-rate-limit-remaining': '42',
        'x-rate-limit-reset': String((NOW.getTime() + 600_000) / 1000),
        'x-user-limit-24hour-limit': '500',
        'x-user-limit-24hour-remaining': '410',
        'x-user-limit-24hour-reset': String((NOW.getTime() + 3_600_000) / 1000),
      }),
    );

    expect(getXApiUsage().accounts[0]?.rateLimits).toEqual([
      {
        endpoint: 'GET /2/tweets',
        limit: 300,
        remaining: 42,
        resetAt: new Date(NOW.getTime() + 600_000).toISOString(),
        dayLimit: 500,
        dayRemaining: 410,
        dayResetAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it('keeps counters per account and adds them for the workspace', async () => {
    const owner = seed('1001', 'owner');
    const brand = seed('2002', 'brand');
    recordXApiCall({
      accountId: owner,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 2,
      costMicros: 10_000,
      status: 'ok',
    });
    recordXApiCall({
      accountId: brand,
      endpoint: 'GET /2/search',
      feature: 'discovery',
      itemCount: 1,
      costMicros: 5_000,
      status: 'ok',
    });

    expect(getSpend(owner)).toEqual({
      todayMicros: 10_000,
      weekMicros: 10_000,
      monthMicros: 10_000,
    });
    expect(getSpend(brand).todayMicros).toBe(5_000);
    const usage = getXApiUsage();
    expect(usage.spend.todayMicros).toBe(15_000);
    expect(usage.accounts.map(({ id }) => id)).toEqual([owner, brand]);
    expect(usage.accounts[0]?.spend.todayMicros).toBe(10_000);
    expect(usage.accounts[1]?.spend.todayMicros).toBe(5_000);
  });

  it('shows each account’s own caps next to its spend', () => {
    const accountId = seed('1001', 'owner');
    saveDiscoverySettings(accountId, 'budget', { dailyCapUsd: 0.5, monthlyCapUsd: null });
    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 1,
      costMicros: 5_000,
      status: 'ok',
    });

    const account = getXApiUsage().accounts[0];
    expect(account?.caps.daily).toMatchObject({
      limitMicros: 500_000,
      spentMicros: 5_000,
      reached: false,
    });
    expect(account?.caps.monthly.limitMicros).toBeNull();
    // The workspace's own caps are separate: none set, so none shown.
    expect(getXApiUsage().caps.daily.limitMicros).toBeNull();
  });
});

describe('budget caps', () => {
  it('allows spend below the daily cap and stops at the boundary', () => {
    const accountId = seed('1001', 'owner');
    saveXApiSettings(settings({ budget: { dailyCapUsd: 0.01 } }));
    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 1,
      costMicros: 9_999,
      status: 'ok',
    });

    expect(() => assertBudget(accountId)).not.toThrow();

    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 1,
      costMicros: 1,
      status: 'ok',
    });
    expect(() => assertBudget(accountId)).toThrow(
      new BudgetExceededError({
        cap: 'daily',
        scope: 'workspace',
        username: null,
        resetAt: new Date('2026-10-28T00:00:00.000Z'),
        spentMicros: 10_000,
        capMicros: 10_000,
      }),
    );
  });

  it('names the monthly cap and its reset when only it is reached', () => {
    const accountId = seed('1001', 'owner');
    saveXApiSettings(settings({ budget: { monthlyCapUsd: 0.01 } }));
    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'performance',
      itemCount: 1,
      costMicros: 10_000,
      status: 'ok',
    });

    expect(() => assertBudget(accountId)).toThrow(
      new BudgetExceededError({
        cap: 'monthly',
        scope: 'workspace',
        username: null,
        resetAt: new Date('2026-11-01T00:00:00.000Z'),
        spentMicros: 10_000,
        capMicros: 10_000,
      }),
    );
  });

  it('stops one account at its own cap and leaves the others spending', () => {
    const owner = seed('1001', 'owner');
    const brand = seed('2002', 'brand');
    saveDiscoverySettings(owner, 'budget', { dailyCapUsd: 0.01, monthlyCapUsd: null });
    recordXApiCall({
      accountId: owner,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 2,
      costMicros: 10_000,
      status: 'ok',
    });

    expect(() => assertBudget(owner)).toThrow(
      new BudgetExceededError({
        cap: 'daily',
        scope: 'account',
        username: 'owner',
        resetAt: new Date('2026-10-28T00:00:00.000Z'),
        spentMicros: 10_000,
        capMicros: 10_000,
      }),
    );
    // The brand spends nothing yet, so its own cap has no say.
    expect(() => assertBudget(brand)).not.toThrow();
  });

  it('keeps the workspace cap as the hard limit above a looser per-account cap', () => {
    const accountId = seed('1001', 'owner');
    saveDiscoverySettings(accountId, 'budget', { dailyCapUsd: 1, monthlyCapUsd: null });
    saveXApiSettings(settings({ budget: { dailyCapUsd: 0.01 } }));
    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 2,
      costMicros: 10_000,
      status: 'ok',
    });

    expect(() => assertBudget(accountId)).toThrow(/for this XBase/);
  });

  it('reports the account cap before the workspace cap when both are reached', () => {
    const accountId = seed('1001', 'owner');
    saveDiscoverySettings(accountId, 'budget', { dailyCapUsd: 0.005, monthlyCapUsd: null });
    saveXApiSettings(settings({ budget: { dailyCapUsd: 0.005 } }));
    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 1,
      costMicros: 5_000,
      status: 'ok',
    });

    expect(() => assertBudget(accountId)).toThrow(/for @owner/);
  });

  it('stops a paid read before it leaves, without a fetch or a usage row', async () => {
    const accountId = seed('1001', 'owner');
    saveXApiSettings(settings({ budget: { dailyCapUsd: 0.01 } }));
    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 2,
      costMicros: 10_000,
      status: 'ok',
    });

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.select().from(xApiCalls).all()).toHaveLength(1);
  });
});

describe('post cache', () => {
  it('serves a cached post within the window, refetches it once stale, and skips the cache when fresh', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockImplementation(async () => reply(postPage([{ id: '1', author_id: '2002' }])));

    const first = await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(first.cached).toBe(0);
    expect(first.posts[0]?.fetchedAt).toBe(NOW.toISOString());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(second.cached).toBe(1);
    expect(second.posts[0]?.text).toBe('Post 1');
    // The cache keeps the time it was read, not the time it was served.
    expect(second.posts[0]?.fetchedAt).toBe(NOW.toISOString());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fresh = await getPosts(accountId, ['1'], { feature: 'performance', fresh: true });
    expect(fresh.cached).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The second read refreshed the cached copy, so another window starts now.
    vi.setSystemTime(new Date(NOW.getTime() + 61 * 60_000));
    const stale = await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(stale.cached).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('isolates cache and counters per account, and uses each account’s own token', async () => {
    const owner = seed('1001', 'owner');
    const brand = seed('2002', 'brand');
    fetchMock.mockImplementation(async () => reply(postPage([{ id: '1', author_id: '3003' }])));

    await getPosts(owner, ['1'], { feature: 'discovery' });
    const brandFirst = await getPosts(brand, ['1'], { feature: 'discovery' });
    expect(brandFirst.cached).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await getPosts(brand, ['1'], { feature: 'discovery' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const headers = new Headers(fetchMock.mock.calls.map(([, init]) => init?.headers)[1]);
    expect(headers.get('authorization')).toBe('Bearer access-2002');
    expect(getSpend(owner).todayMicros).toBe(5_000);
    expect(getSpend(brand).todayMicros).toBe(5_000);
    expect(
      db
        .select({ accountId: xApiCalls.accountId })
        .from(xApiCalls)
        .all()
        .map(({ accountId }) => accountId),
    ).toEqual([owner, brand]);
  });

  it('honours a shortened cache window', async () => {
    const accountId = seed('1001', 'owner');
    saveXApiSection('cache', { windowMinutes: 5 });
    fetchMock.mockImplementation(async () => reply(postPage([{ id: '1', author_id: '2002' }])));

    await getPosts(accountId, ['1'], { feature: 'full_text' });
    vi.setSystemTime(new Date(NOW.getTime() + 6 * 60_000));
    await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a zero window as no cache', async () => {
    const accountId = seed('1001', 'owner');
    saveXApiSection('cache', { windowMinutes: 0 });
    fetchMock.mockImplementation(async () => reply(postPage([{ id: '1', author_id: '2002' }])));

    await getPosts(accountId, ['1'], { feature: 'full_text' });
    await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('full text and quotes', () => {
  it('returns note_tweet’s body instead of the truncated text', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(
      reply(
        postPage([
          {
            id: '1',
            author_id: '2002',
            text: 'A long post that X cuts at…',
            note_tweet: { text: 'A long post, in full, with the ending X hides from text.' },
          },
        ]),
      ),
    );

    const { posts } = await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(posts[0]?.text).toBe('A long post, in full, with the ending X hides from text.');

    const params = callUrl().searchParams;
    expect(params.get('tweet.fields')).toContain('note_tweet');
    expect(params.get('expansions')).toContain('referenced_tweets.id.author_id');
  });

  it('brings a quoted post with its full text and author, and caches it on its own', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(
      reply(
        postPage([{ id: '1', author_id: '2002', quotes: '9' }], {
          quoted: [
            {
              id: '9',
              author_id: '3003',
              username: 'quoted',
              text: 'The short preview…',
              note_tweet: { text: 'The quoted post in full.' },
            },
          ],
        }),
      ),
    );

    const { posts } = await getPosts(accountId, ['1'], { feature: 'full_text' });
    // The quote is attached to the post, not returned as a second result, and billed once.
    expect(posts).toHaveLength(1);
    expect(posts[0]?.quotedPost).toEqual({
      id: '9',
      authorId: '3003',
      authorUsername: 'quoted',
      text: 'The quoted post in full.',
    });
    expect(db.select().from(xApiCalls).get()).toMatchObject({
      itemCount: 1,
      costMicros: 5_000,
    });

    // The quote survives the cache, and the quoted post answers a later read on its own.
    const parent = await getPosts(accountId, ['1'], { feature: 'full_text' });
    expect(parent.cached).toBe(1);
    expect(parent.posts[0]?.quotedPost?.text).toBe('The quoted post in full.');

    const quoted = await getPosts(accountId, ['9'], { feature: 'full_text' });
    expect(quoted.cached).toBe(1);
    expect(quoted.posts[0]?.text).toBe('The quoted post in full.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never replaces a resolved quote with an unresolved include', async () => {
    const accountId = seed('1001', 'owner');

    // A direct read resolves post 9's own quote.
    fetchMock.mockResolvedValueOnce(
      reply(
        postPage([{ id: '9', author_id: '3003', quotes: '8' }], {
          quoted: [{ id: '8', author_id: '4004', username: 'deeper', text: 'The deeper quote.' }],
        }),
      ),
    );
    const direct = await getPosts(accountId, ['9'], { feature: 'full_text' });
    expect(direct.posts[0]?.quotedPost?.id).toBe('8');

    // A search returns 9 only as someone's quote; X doesn't expand what 9 itself quotes.
    fetchMock.mockResolvedValueOnce(
      reply(
        postPage([{ id: '1', author_id: '2002', quotes: '9' }], {
          quoted: [{ id: '9', author_id: '3003', text: 'Nine', quotes: '8' }],
        }),
      ),
    );
    await searchRecent(accountId, 'nine', { feature: 'discovery' });

    // The cached copy keeps the quote the direct read resolved.
    const cached = await getPosts(accountId, ['9'], { feature: 'full_text' });
    expect(cached.cached).toBe(1);
    expect(cached.posts[0]?.quotedPost?.id).toBe('8');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('rate limits', () => {
  const resetAt = new Date(NOW.getTime() + 15 * 60_000);

  it('stores the reported reset and refuses to call again until then', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(
      reply(
        { title: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'x-rate-limit-limit': '100',
            'x-rate-limit-remaining': '0',
            'x-rate-limit-reset': String(resetAt.getTime() / 1000),
          },
        },
      ),
    );

    const first = getPosts(accountId, ['1'], { feature: 'full_text' });
    await expect(first).rejects.toBeInstanceOf(RateLimitedError);
    await expect(first).rejects.toMatchObject({ resetAt });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.select().from(xRateLimits).get()).toMatchObject({
      accountId,
      endpoint: 'GET /2/tweets',
      remaining: 0,
      resetAt,
    });
    expect(db.select().from(xApiCalls).get()).toMatchObject({
      status: 'rate_limited',
      costMicros: 0,
    });

    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).rejects.toMatchObject({
      name: 'RateLimitedError',
      resetAt,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past the reset time the endpoint is tried again, once.
    vi.setSystemTime(new Date(resetAt.getTime() + 1000));
    fetchMock.mockResolvedValueOnce(reply(postPage([{ id: '2', author_id: '2002' }])));
    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('blocks for the fallback quarter hour when a 429 carries no reset header', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(reply({ title: 'Too Many Requests' }, { status: 429 }));

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toMatchObject({
      resetAt: new Date(NOW.getTime() + 15 * 60_000),
    });
    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits for the 24-hour reset when that is the empty window', async () => {
    const accountId = seed('1001', 'owner');
    const shortReset = new Date(NOW.getTime() + 15 * 60_000);
    const dayReset = new Date(NOW.getTime() + 60 * 60_000);
    fetchMock.mockResolvedValueOnce(
      reply(
        { title: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'x-rate-limit-limit': '300',
            'x-rate-limit-remaining': '5',
            'x-rate-limit-reset': String(shortReset.getTime() / 1000),
            'x-user-limit-24hour-limit': '500',
            'x-user-limit-24hour-remaining': '0',
            'x-user-limit-24hour-reset': String(dayReset.getTime() / 1000),
          },
        },
      ),
    );

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toMatchObject({
      resetAt: dayReset,
    });
    expect(db.select().from(xRateLimits).get()).toMatchObject({
      remaining: 0,
      resetAt: dayReset,
      dayRemaining: 0,
      dayResetAt: dayReset,
    });

    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks when the stored 24-hour window is empty even with short-window room', async () => {
    const accountId = seed('1001', 'owner');
    const dayReset = new Date(NOW.getTime() + 60 * 60_000);
    saveRateLimits(
      accountId,
      'GET /2/tweets',
      new Headers({
        'x-rate-limit-limit': '300',
        'x-rate-limit-remaining': '5',
        'x-rate-limit-reset': String((NOW.getTime() + 15 * 60_000) / 1000),
        'x-user-limit-24hour-limit': '500',
        'x-user-limit-24hour-remaining': '0',
        'x-user-limit-24hour-reset': String(dayReset.getTime() / 1000),
      }),
    );

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toMatchObject({
      resetAt: dayReset,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the pages already read and stops when a later page is throttled', async () => {
    const accountId = seed('1001', 'owner');
    saveDiscoverySettings(accountId, 'sources', { homeTimelinePages: 3 });
    const reset = new Date(NOW.getTime() + 900_000);
    fetchMock
      .mockResolvedValueOnce(
        reply(postPage([{ id: '1', author_id: '2002' }], { nextToken: 'next' })),
      )
      .mockResolvedValueOnce(
        reply(
          { title: 'Too Many Requests' },
          {
            status: 429,
            headers: {
              'x-rate-limit-remaining': '0',
              'x-rate-limit-reset': String(reset.getTime() / 1000),
            },
          },
        ),
      );

    const run = await homeTimeline(accountId, { feature: 'discovery' });
    expect(run.pagesFetched).toBe(1);
    expect(run.posts.map(({ id }) => id)).toEqual(['1']);
    expect(run.stop).toMatchObject({ reason: 'rate_limit', resetAt: reset.toISOString() });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('home timeline', () => {
  it('fetches one page by default and the account’s configured number when raised', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockImplementation(async () =>
      reply(postPage([{ id: '1', author_id: '2002' }], { nextToken: 'next' })),
    );

    expect(getDiscoverySettings(accountId).sources.homeTimelinePages).toBe(1);
    const one = await homeTimeline(accountId, { feature: 'discovery' });
    expect(one.pagesFetched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    saveDiscoverySettings(accountId, 'sources', { homeTimelinePages: 2 });
    const two = await homeTimeline(accountId, { feature: 'discovery' });
    expect(two.pagesFetched).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('finishes the page it is on when the spend cap is reached, then stops', async () => {
    const accountId = seed('1001', 'owner');
    saveXApiSettings(settings({ budget: { dailyCapUsd: 0.125 } }));
    saveDiscoverySettings(accountId, 'sources', { homeTimelinePages: 3 });
    const page = postPage(
      Array.from({ length: X_SEARCH_RESULTS_PER_CALL }, (_, index) => ({
        id: `p${index}`,
        author_id: '2002',
      })),
      { nextToken: 'next' },
    );
    fetchMock.mockImplementation(async () => reply(page));

    const run = await homeTimeline(accountId, { feature: 'discovery' });
    expect(run.posts).toHaveLength(X_SEARCH_RESULTS_PER_CALL);
    expect(run.pagesFetched).toBe(1);
    expect(run.stop).toMatchObject({ reason: 'budget', scope: 'workspace', cap: 'daily' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('search and users', () => {
  it('asks for one page of 25 results and logs the reads', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(reply(postPage([{ id: '1', author_id: '2002' }])));

    const page = await searchRecent(accountId, ' buildinpublic ', { feature: 'discovery' });
    expect(page.posts).toHaveLength(1);

    const parsed = callUrl();
    expect(parsed.pathname).toBe('/2/tweets/search/recent');
    expect(parsed.searchParams.get('query')).toBe('buildinpublic');
    expect(parsed.searchParams.get('max_results')).toBe('25');
    expect(db.select().from(xApiCalls).get()).toMatchObject({
      endpoint: 'GET /2/tweets/search/recent',
      itemCount: 1,
      costMicros: 5_000,
    });
  });

  it('rejects an empty search without calling X', async () => {
    const accountId = seed('1001', 'owner');
    await expect(searchRecent(accountId, '   ', { feature: 'discovery' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads users as follower reads and caches nothing', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(
      reply({
        data: [
          { id: '2002', username: 'brand', name: 'Brand', profile_image_url: 'https://x/a.png' },
          { id: '3003', username: 'other', name: 'Other' },
        ],
      }),
    );

    const users = await getUsers(accountId, ['2002', '3003'], { feature: 'profile' });
    expect(users.map(({ username }) => username)).toEqual(['brand', 'other']);
    expect(db.select().from(xApiCalls).get()).toMatchObject({
      endpoint: 'GET /2/users',
      itemCount: 2,
      costMicros: 2_000,
    });
    expect(db.select().from(xPosts).all()).toEqual([]);
  });

  it('reads the follow list in pages of 1,000', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock
      .mockResolvedValueOnce(
        reply({ data: [{ id: '2002', username: 'brand' }], meta: { next_token: 'next' } }),
      )
      .mockResolvedValueOnce(reply({ data: [{ id: '3003', username: 'other' }], meta: {} }));

    const follows = await getUserList(accountId, 'following', { feature: 'discovery' });
    expect(follows).toEqual([
      { id: '2002', username: 'brand' },
      { id: '3003', username: 'other' },
    ]);
    expect(callUrl(0).pathname).toBe('/2/users/1001/following');
    expect(callUrl(0).searchParams.get('max_results')).toBe('1000');
    expect(callUrl(0).searchParams.get('pagination_token')).toBeNull();
    expect(callUrl(1).searchParams.get('pagination_token')).toBe('next');
    expect(db.select().from(xApiCalls).all()).toMatchObject([
      { endpoint: 'GET /2/users/:id/following', itemCount: 1, costMicros: 1_000 },
      { endpoint: 'GET /2/users/:id/following', itemCount: 1, costMicros: 1_000 },
    ]);
  });

  it.each(['muting', 'blocking'] as const)(
    'reads the %s list at $0.001 an account',
    async (list) => {
      const accountId = seed('1001', 'owner');
      fetchMock.mockResolvedValueOnce(
        reply({
          data: [
            { id: '2002', username: 'spam' },
            { id: '3003', username: 'troll' },
          ],
        }),
      );

      expect(await getUserList(accountId, list, { feature: 'discovery' })).toEqual([
        { id: '2002', username: 'spam' },
        { id: '3003', username: 'troll' },
      ]);
      expect(callUrl(0).pathname).toBe(`/2/users/1001/${list}`);
      expect(callUrl(0).searchParams.get('max_results')).toBe('1000');
      expect(db.select().from(xApiCalls).all()).toMatchObject([
        { endpoint: `GET /2/users/:id/${list}`, itemCount: 2, costMicros: 2_000 },
      ]);
    },
  );
});

describe('tokens', () => {
  it('renews an expired access token once, saving the rotated refresh token', async () => {
    const accountId = seed('1001', 'owner', 10);
    fetchMock
      .mockResolvedValueOnce(
        reply(
          {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 7200,
            scope: 'tweet.read users.read offline.access',
          },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(reply(postPage([{ id: '1', author_id: '2002' }])));

    await getPosts(accountId, ['1'], { feature: 'full_text' });

    expect(callUrl(0).toString()).toBe('https://api.x.com/2/oauth2/token');
    const form = fetchMock.mock.calls[0]?.[1]?.body;
    expect(form).toBeInstanceOf(URLSearchParams);
    expect((form as URLSearchParams).get('grant_type')).toBe('refresh_token');
    expect((form as URLSearchParams).get('refresh_token')).toBe('refresh-1001');

    const headers = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer new-access');

    const stored = getAccountCredentials(accountId);
    expect(stored?.accessToken).not.toBe('access-1001');
    expect(stored?.refreshToken).not.toBe('refresh-1001');
    expect(db.select().from(xAccounts).get()).toMatchObject({ username: 'owner' });
  });

  it('flags the account when the refresh token is refused, and clears it on a new sign-in', async () => {
    const accountId = seed('1001', 'owner', 10);
    fetchMock.mockResolvedValueOnce(reply({ error: 'invalid_grant' }, { status: 400 }));

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.select().from(xApiCalls).all()).toEqual([]);
    expect(getAccountCredentials(accountId)?.reconnectRequiredAt).toBeInstanceOf(Date);
    expect(listAccounts()[0]?.reconnectRequired).toBe(true);

    // Flagged: no read is tried, so X is not asked again.
    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Signing in again gives the account working tokens and clears the flag.
    saveAccount(
      { id: accountId, username: 'owner', name: 'Owner', avatarUrl: null },
      {
        accessToken: 'fresh-access',
        refreshToken: 'fresh-refresh',
        expiresAt: new Date(Date.now() + 7_200_000),
        scope: 'tweet.read users.read offline.access',
      },
    );
    expect(getAccountCredentials(accountId)?.reconnectRequiredAt).toBeNull();
    expect(listAccounts()[0]?.reconnectRequired).toBe(false);

    fetchMock.mockResolvedValueOnce(reply(postPage([{ id: '2', author_id: '2002' }])));
    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('flags the account on a 401, logs the failure, and stops further reads', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(reply({ title: 'Unauthorized' }, { status: 401 }));

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
    expect(db.select().from(xApiCalls).get()).toMatchObject({
      status: 'error',
      itemCount: 0,
      costMicros: 0,
    });
    expect(listAccounts()[0]?.reconnectRequired).toBe(true);

    await expect(getPosts(accountId, ['2'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the pages already read when a later page needs a new sign-in', async () => {
    const accountId = seed('1001', 'owner');
    saveDiscoverySettings(accountId, 'sources', { homeTimelinePages: 2 });
    fetchMock
      .mockResolvedValueOnce(
        reply(postPage([{ id: '1', author_id: '2002' }], { nextToken: 'next' })),
      )
      .mockResolvedValueOnce(reply({ title: 'Unauthorized' }, { status: 401 }));

    const run = await homeTimeline(accountId, { feature: 'discovery' });
    expect(run.pagesFetched).toBe(1);
    expect(run.posts.map(({ id }) => id)).toEqual(['1']);
    expect(run.stop).toMatchObject({ reason: 'reconnect' });
  });
});
