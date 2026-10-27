import {
  BudgetExceededError,
  InvalidStateError,
  RateLimitedError,
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
import { getAccountCredentials, saveAccountTokens } from '../accounts';
import type { Env } from '../env';
import { getPosts, getUsers, homeTimeline, searchRecent } from '../x-api-client';
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
  note_tweet?: { text: string };
};

/** A /2/tweets or search answer, with the authors in includes.users. */
function postPage(tweets: Tweet[], nextToken?: string) {
  const authors = new Map<string, { id: string; username: string; name: string }>();
  for (const tweet of tweets) {
    if (!tweet.author_id) continue;
    authors.set(tweet.author_id, {
      id: tweet.author_id,
      username: tweet.username ?? `user${tweet.author_id}`,
      name: `User ${tweet.author_id}`,
    });
  }
  return {
    data: tweets.map((tweet) => ({
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
    })),
    includes: { users: [...authors.values()] },
    meta: nextToken ? { next_token: nextToken } : {},
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
  sources?: Partial<XApiSettings['sources']>;
};

const settings = (overrides: SettingsOverrides = {}): XApiSettings => ({
  budget: { dailyCapUsd: null, monthlyCapUsd: null, ...overrides.budget },
  cache: { windowMinutes: 60, ...overrides.cache },
  sources: { homeTimelinePages: 1, ...overrides.sources },
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

    saveXApiSection('sources', { homeTimelinePages: 3 });
    expect(getXApiSettings()).toEqual(
      settings({
        budget: { dailyCapUsd: 1 },
        cache: { windowMinutes: 15 },
        sources: { homeTimelinePages: 3 },
      }),
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

    expect(() => assertBudget()).not.toThrow();

    recordXApiCall({
      accountId,
      endpoint: 'GET /2/tweets',
      feature: 'discovery',
      itemCount: 1,
      costMicros: 1,
      status: 'ok',
    });
    expect(() => assertBudget()).toThrow(
      new BudgetExceededError({
        cap: 'daily',
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

    expect(() => assertBudget()).toThrow(
      new BudgetExceededError({
        cap: 'monthly',
        resetAt: new Date('2026-11-01T00:00:00.000Z'),
        spentMicros: 10_000,
        capMicros: 10_000,
      }),
    );
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

  it('returns the pages already read and stops when a later page is throttled', async () => {
    const accountId = seed('1001', 'owner');
    saveXApiSection('sources', { homeTimelinePages: 3 });
    const reset = new Date(NOW.getTime() + 900_000);
    fetchMock
      .mockResolvedValueOnce(reply(postPage([{ id: '1', author_id: '2002' }], 'next')))
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
  it('fetches one page by default and the configured number when raised', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockImplementation(async () =>
      reply(postPage([{ id: '1', author_id: '2002' }], 'next')),
    );

    expect(getXApiSettings().sources.homeTimelinePages).toBe(1);
    const one = await homeTimeline(accountId, { feature: 'discovery' });
    expect(one.pagesFetched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    saveXApiSection('sources', { homeTimelinePages: 2 });
    const two = await homeTimeline(accountId, { feature: 'discovery' });
    expect(two.pagesFetched).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('finishes the page it is on when the spend cap is reached, then stops', async () => {
    const accountId = seed('1001', 'owner');
    saveXApiSettings(
      settings({
        budget: { dailyCapUsd: 0.125 },
        sources: { homeTimelinePages: 3 },
      }),
    );
    const page = postPage(
      Array.from({ length: X_SEARCH_RESULTS_PER_CALL }, (_, index) => ({
        id: `p${index}`,
        author_id: '2002',
      })),
      'next',
    );
    fetchMock.mockImplementation(async () => reply(page));

    const run = await homeTimeline(accountId, { feature: 'discovery' });
    expect(run.posts).toHaveLength(X_SEARCH_RESULTS_PER_CALL);
    expect(run.pagesFetched).toBe(1);
    expect(run.stop).toMatchObject({ reason: 'budget', cap: 'daily' });
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

  it('says to sign in again when the refresh is refused', async () => {
    const accountId = seed('1001', 'owner', 10);
    fetchMock.mockResolvedValueOnce(reply({ error: 'invalid_grant' }, { status: 400 }));

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      InvalidStateError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.select().from(xApiCalls).all()).toEqual([]);
  });

  it('turns a 401 on a read into a sign-in message and logs the failure', async () => {
    const accountId = seed('1001', 'owner');
    fetchMock.mockResolvedValueOnce(reply({ title: 'Unauthorized' }, { status: 401 }));

    await expect(getPosts(accountId, ['1'], { feature: 'full_text' })).rejects.toBeInstanceOf(
      InvalidStateError,
    );
    expect(db.select().from(xApiCalls).get()).toMatchObject({
      status: 'error',
      itemCount: 0,
      costMicros: 0,
    });
  });
});
