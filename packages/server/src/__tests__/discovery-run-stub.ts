import { getDb } from '@xbase/db/client';
import { followedAccounts, xAccounts } from '@xbase/db/schema';
import { seedAccount } from '@xbase/db/testing';
import { eq } from 'drizzle-orm';
import type { Mock } from 'vitest';
import { saveAccountTokens } from '../accounts';

// A stubbed X for discovery runs: pages shaped like X's answers, a fetch that serves them by
// path, and a linked account whose follow list is already cached. Tests mock `../env` themselves.

export const NOW = new Date('2026-10-27T15:00:00.000Z');
export const DAY_MS = 24 * 60 * 60 * 1000;

export const HOME = '/2/users/1001/timelines/reverse_chronological';
export const SEARCH = '/2/tweets/search/recent';
export const FOLLOWING = '/2/users/1001/following';

export const urlOf = (input: Parameters<typeof fetch>[0]): URL => {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
};

export const reply = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
};

export type Tweet = {
  id: string;
  text?: string;
  author_id?: string;
  username?: string;
  createdAt?: string;
  note_tweet?: { text: string };
  references?: { type: string; id: string }[];
  mediaKeys?: string[];
};

const asTweet = (tweet: Tweet) => ({
  id: tweet.id,
  text: tweet.text ?? `Post ${tweet.id}`,
  author_id: tweet.author_id ?? 'a1',
  created_at: tweet.createdAt ?? new Date(NOW.getTime() - 60 * 60_000).toISOString(),
  public_metrics: {
    impression_count: 500,
    like_count: 7,
    reply_count: 1,
    retweet_count: 2,
    quote_count: 0,
  },
  ...(tweet.note_tweet ? { note_tweet: tweet.note_tweet } : {}),
  ...(tweet.references ? { referenced_tweets: tweet.references } : {}),
  ...(tweet.mediaKeys ? { attachments: { media_keys: tweet.mediaKeys } } : {}),
});

/** A page with every author and every quoted post in includes, as X returns them. */
export function page(tweets: Tweet[], quoted: Tweet[] = []) {
  const authors = new Map<
    string,
    { id: string; username: string; name: string; public_metrics: { followers_count: number } }
  >();
  for (const tweet of [...tweets, ...quoted]) {
    const id = tweet.author_id ?? 'a1';
    if (!authors.has(id)) {
      authors.set(id, {
        id,
        username: tweet.username ?? `user_${id}`,
        name: `User ${id}`,
        public_metrics: { followers_count: 2_400 },
      });
    }
  }
  return {
    data: tweets.map(asTweet),
    includes: {
      users: [...authors.values()],
      ...(quoted.length > 0 ? { tweets: quoted.map(asTweet) } : {}),
    },
    meta: {},
  };
}

/** A linked account whose tokens are stored as x-api-http expects them. */
export function seed(scope = 'tweet.read users.read follows.read tweet.write offline.access') {
  seedAccount({ id: '1001', username: 'owner' });
  saveAccountTokens('1001', {
    accessToken: 'access-1001',
    refreshToken: 'refresh-1001',
    expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    scope,
  });
  return '1001';
}

/** The follow list as a fresh cache: a run then spends nothing to learn who the user follows. */
export function cacheFollowing(accountId: string, userIds: string[]) {
  getDb().transaction((tx) => {
    if (userIds.length > 0) {
      tx.insert(followedAccounts)
        .values(userIds.map((userId) => ({ accountId, userId })))
        .run();
    }
    tx.update(xAccounts)
      .set({ followingRefreshedAt: NOW })
      .where(eq(xAccounts.id, accountId))
      .run();
  });
}

/** Answers every request by pathname; `calls` records each URL for assertions. */
export function serve(
  fetchMock: Mock<typeof fetch>,
  routes: Record<string, unknown>,
  calls: URL[] = [],
): URL[] {
  fetchMock.mockImplementation(async (input) => {
    const url = urlOf(input);
    calls.push(url);
    const route = routes[url.pathname];
    if (route === undefined) throw new Error(`Unexpected X call: ${url.pathname}`);
    return reply(route);
  });
  return calls;
}
