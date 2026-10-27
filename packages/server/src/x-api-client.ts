import { BudgetExceededError, RateLimitedError, ValidationError } from '@xbase/core/errors';
import {
  type XApiFeature,
  X_HOME_TIMELINE_MAX_PAGES,
  X_POSTS_PER_CALL,
  X_SEARCH_RESULTS_PER_CALL,
  estimateReadCostMicros,
} from '@xbase/core/x-api';
import { getDb } from '@xbase/db/client';
import { type CachedPost, xPosts } from '@xbase/db/schema';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { xRequest } from './x-api-http';
import { getXApiSettings } from './x-api-settings';

// The one layer that reads X: posts, users, search and the home timeline. Every feature calls
// these functions, so every paid call passes the same budget check, is logged with its estimated
// cost, and uses the same per-account post cache. Tokens are the account's own (x-auth.ts renews
// them); the HTTP plumbing is x-api-http.ts.

const TWEET_FIELDS =
  'created_at,public_metrics,author_id,conversation_id,lang,attachments,referenced_tweets';
const USER_FIELDS = 'profile_image_url,public_metrics';

/** One post as the read layer returns it. `data` keeps X's response for later normalization. */
export type XPost = {
  id: string;
  authorId: string;
  authorUsername: string | null;
  text: string;
  createdAt: string | null;
  metrics: Record<string, number> | null;
  /** When this copy was read from X; a cache hit keeps the earlier time. */
  fetchedAt: string;
  /** The raw tweet: full text, quoted posts and edit history stay available to features. */
  data: unknown;
};

export type XUser = {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
  metrics: Record<string, number> | null;
};

export type XPage = { posts: XPost[]; users: XUser[] };

export type XPostsResult = XPage & {
  /** How many of the requested posts the cache answered, so a caller can report the saving. */
  cached: number;
};

/** Why a timeline run stopped after a page instead of finishing every page the owner asked for. */
export type XTimelineStop =
  | { reason: 'budget'; cap: 'daily' | 'monthly'; resetAt: string; message: string }
  | { reason: 'rate_limit'; resetAt: string; message: string };

export type XTimelineRun = XPage & {
  pagesFetched: number;
  stop: XTimelineStop | null;
};

const TweetSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  public_metrics: z.record(z.string(), z.number()).optional(),
});

const UserSchema = z.looseObject({
  id: z.string().min(1),
  username: z.string().min(1),
  name: z.string(),
  profile_image_url: z.string().optional(),
  public_metrics: z.record(z.string(), z.number()).optional(),
});

const TweetPage = z.looseObject({
  data: z.array(TweetSchema).optional(),
  includes: z.looseObject({ users: z.array(UserSchema).optional() }).optional(),
  meta: z.looseObject({ next_token: z.string().optional() }).optional(),
});

const UserPage = z.looseObject({
  data: z.array(UserSchema).optional(),
});

type RawTweet = z.infer<typeof TweetSchema>;
type RawUser = z.infer<typeof UserSchema>;

const toUser = (user: RawUser): XUser => ({
  id: user.id,
  username: user.username,
  name: user.name,
  profileImageUrl: user.profile_image_url ?? null,
  metrics: user.public_metrics ?? null,
});

const toPost = (tweet: RawTweet, users: Map<string, XUser>, fetchedAt: Date): XPost => ({
  id: tweet.id,
  authorId: tweet.author_id ?? '',
  authorUsername: tweet.author_id ? (users.get(tweet.author_id)?.username ?? null) : null,
  text: tweet.text,
  createdAt: tweet.created_at ?? null,
  metrics: tweet.public_metrics ?? null,
  fetchedAt: fetchedAt.toISOString(),
  data: tweet,
});

/** X's answer as posts, authors and the next page; a shape XBase can't read is an error. */
function parsePostPage(
  body: unknown,
  fetchedAt = new Date(),
): XPage & { nextToken: string | null } {
  const parsed = TweetPage.safeParse(body);
  if (!parsed.success) throw new Error('X answered in a shape XBase doesn’t understand.');
  const users = (parsed.data.includes?.users ?? []).map(toUser);
  const byId = new Map(users.map((user) => [user.id, user]));
  return {
    posts: (parsed.data.data ?? []).map((tweet) => toPost(tweet, byId, fetchedAt)),
    users,
    nextToken: parsed.data.meta?.next_token ?? null,
  };
}

/** The number of reads and their price: own posts are cheaper than other people's. */
const postCost = (accountId: string, posts: XPost[]) => {
  const ownItems = posts.filter(({ authorId }) => authorId === accountId).length;
  return {
    itemCount: posts.length,
    costMicros: estimateReadCostMicros({ ownItems, otherItems: posts.length - ownItems }),
  };
};

/** A post is cached per account, so one account's reads never answer another's. */
function cachedPost(row: CachedPost): XPost | null {
  const parsed = TweetSchema.safeParse(row.data);
  if (!parsed.success) return null;
  return {
    id: row.postId,
    authorId: row.authorId ?? parsed.data.author_id ?? '',
    authorUsername: row.authorUsername,
    text: row.text,
    createdAt: parsed.data.created_at ?? null,
    metrics: parsed.data.public_metrics ?? null,
    fetchedAt: row.fetchedAt.toISOString(),
    data: parsed.data,
  };
}

function readCachedPosts(accountId: string, ids: string[], cutoff: Date): XPost[] {
  if (ids.length === 0) return [];
  return getDb()
    .select()
    .from(xPosts)
    .where(
      and(
        eq(xPosts.accountId, accountId),
        inArray(xPosts.postId, ids),
        gte(xPosts.fetchedAt, cutoff),
      ),
    )
    .all()
    .map(cachedPost)
    .filter((post): post is XPost => post !== null);
}

function cachePosts(accountId: string, posts: XPost[], fetchedAt: Date): void {
  if (posts.length === 0) return;
  const db = getDb();
  db.transaction((tx) => {
    for (const post of posts) {
      const values = {
        accountId,
        postId: post.id,
        authorId: post.authorId || null,
        authorUsername: post.authorUsername,
        text: post.text,
        data: post.data,
        fetchedAt,
      };
      tx.insert(xPosts)
        .values(values)
        .onConflictDoUpdate({ target: [xPosts.accountId, xPosts.postId], set: values })
        .run();
    }
  });
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

/**
 * Posts by id. Posts fetched within the cache window are served from the database; `fresh: true`
 * skips the cache to pay for current engagement numbers (and then replaces the cached copy).
 */
export async function getPosts(
  accountId: string,
  ids: string[],
  { feature, fresh = false }: { feature: XApiFeature; fresh?: boolean },
): Promise<XPostsResult> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return { posts: [], users: [], cached: 0 };

  const { windowMinutes } = getXApiSettings().cache;
  const cached =
    fresh || windowMinutes === 0
      ? []
      : readCachedPosts(accountId, wanted, new Date(Date.now() - windowMinutes * 60_000));
  const cachedIds = new Set(cached.map(({ id }) => id));
  const missing = wanted.filter((id) => !cachedIds.has(id));

  const fetched: XPost[] = [];
  const users: XUser[] = [];
  for (const chunk of chunks(missing, X_POSTS_PER_CALL)) {
    // oxlint-disable-next-line no-await-in-loop -- chunks are paid calls: each passes the cap check before the next sends
    const body = await xRequest({
      accountId,
      endpoint: 'GET /2/tweets',
      path: '/tweets',
      params: { ids: chunk.join(','), 'tweet.fields': TWEET_FIELDS, expansions: 'author_id' },
      feature,
      cost: (payload) => postCost(accountId, parsePostPage(payload).posts),
    });
    const fetchedAt = new Date();
    const page = parsePostPage(body, fetchedAt);
    cachePosts(accountId, page.posts, fetchedAt);
    fetched.push(...page.posts);
    users.push(...page.users);
  }

  const byId = new Map([...cached, ...fetched].map((post) => [post.id, post]));
  return {
    posts: wanted.map((id) => byId.get(id)).filter((post): post is XPost => post !== undefined),
    users,
    cached: cached.length,
  };
}

/** One page of recent search, newest first, at most the tier's 25 results. */
export async function searchRecent(
  accountId: string,
  query: string,
  { feature }: { feature: XApiFeature },
): Promise<XPage> {
  if (!query.trim()) throw new ValidationError('Write a search query first.');
  const body = await xRequest({
    accountId,
    endpoint: 'GET /2/tweets/search/recent',
    path: '/tweets/search/recent',
    params: {
      query: query.trim(),
      max_results: String(X_SEARCH_RESULTS_PER_CALL),
      'tweet.fields': TWEET_FIELDS,
      expansions: 'author_id',
    },
    feature,
    cost: (payload) => postCost(accountId, parsePostPage(payload).posts),
  });
  const fetchedAt = new Date();
  const page = parsePostPage(body, fetchedAt);
  cachePosts(accountId, page.posts, fetchedAt);
  return { posts: page.posts, users: page.users };
}

/** Users by id, for author profiles and follower counts. */
export async function getUsers(
  accountId: string,
  ids: string[],
  { feature }: { feature: XApiFeature },
): Promise<XUser[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  const users: XUser[] = [];
  for (const chunk of chunks(wanted, X_POSTS_PER_CALL)) {
    // oxlint-disable-next-line no-await-in-loop -- chunks are paid calls: each passes the cap check before the next sends
    const body = await xRequest({
      accountId,
      endpoint: 'GET /2/users',
      path: '/users',
      params: { ids: chunk.join(','), 'user.fields': USER_FIELDS },
      feature,
      cost: (payload) => {
        const parsed = UserPage.safeParse(payload);
        const read = parsed.success ? (parsed.data.data ?? []) : [];
        return {
          itemCount: read.length,
          costMicros: estimateReadCostMicros({ ownItems: read.length }),
        };
      },
    });
    const parsed = UserPage.safeParse(body);
    if (!parsed.success) throw new Error('X answered in a shape XBase doesn’t understand.');
    users.push(...(parsed.data.data ?? []).map(toUser));
  }
  return users;
}

/** Users by handle, for a watch list without a lookup call per handle. */
export async function getUsersByUsername(
  accountId: string,
  usernames: string[],
  { feature }: { feature: XApiFeature },
): Promise<XUser[]> {
  const wanted = [...new Set(usernames.map((name) => name.replace(/^@/, '').trim()))].filter(
    Boolean,
  );
  const users: XUser[] = [];
  for (const chunk of chunks(wanted, X_POSTS_PER_CALL)) {
    // oxlint-disable-next-line no-await-in-loop -- chunks are paid calls: each passes the cap check before the next sends
    const body = await xRequest({
      accountId,
      endpoint: 'GET /2/users/by',
      path: '/users/by',
      params: { usernames: chunk.join(','), 'user.fields': USER_FIELDS },
      feature,
      cost: (payload) => {
        const parsed = UserPage.safeParse(payload);
        const read = parsed.success ? (parsed.data.data ?? []) : [];
        return {
          itemCount: read.length,
          costMicros: estimateReadCostMicros({ ownItems: read.length }),
        };
      },
    });
    const parsed = UserPage.safeParse(body);
    if (!parsed.success) throw new Error('X answered in a shape XBase doesn’t understand.');
    users.push(...(parsed.data.data ?? []).map(toUser));
  }
  return users;
}

/**
 * The home timeline, one paid page at a time. `pages` defaults to the owner's setting (one page
 * unless raised). A cap or a 429 after the first page returns what was read with `stop` set, so a
 * running job finishes its page and then stops instead of losing it.
 */
export async function homeTimeline(
  accountId: string,
  { feature, pages }: { feature: XApiFeature; pages?: number },
): Promise<XTimelineRun> {
  const wanted = Math.min(
    Math.max(1, Math.trunc(pages ?? getXApiSettings().sources.homeTimelinePages)),
    X_HOME_TIMELINE_MAX_PAGES,
  );
  const posts: XPost[] = [];
  const users: XUser[] = [];
  let pagesFetched = 0;
  let nextToken: string | undefined;
  let stop: XTimelineStop | null = null;

  for (let page = 0; page < wanted; page += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- pages are paid calls: each passes the cap check in order
      const body = await xRequest({
        accountId,
        endpoint: 'GET /2/users/:id/timelines/reverse_chronological',
        path: `/users/${encodeURIComponent(accountId)}/timelines/reverse_chronological`,
        params: {
          max_results: String(X_SEARCH_RESULTS_PER_CALL),
          'tweet.fields': TWEET_FIELDS,
          expansions: 'author_id',
          ...(nextToken ? { pagination_token: nextToken } : {}),
        },
        feature,
        cost: (payload) => postCost(accountId, parsePostPage(payload).posts),
      });
      const fetchedAt = new Date();
      const parsed = parsePostPage(body, fetchedAt);
      cachePosts(accountId, parsed.posts, fetchedAt);
      posts.push(...parsed.posts);
      users.push(...parsed.users);
      pagesFetched += 1;
      nextToken = parsed.nextToken ?? undefined;
      if (!nextToken) break;
    } catch (error) {
      if (pagesFetched === 0) throw error;
      if (error instanceof BudgetExceededError) {
        stop = {
          reason: 'budget',
          cap: error.cap,
          resetAt: error.resetAt.toISOString(),
          message: error.message,
        };
        break;
      }
      if (error instanceof RateLimitedError) {
        stop = {
          reason: 'rate_limit',
          resetAt: error.resetAt.toISOString(),
          message: error.message,
        };
        break;
      }
      throw error;
    }
  }

  return { posts, users, pagesFetched, stop };
}
