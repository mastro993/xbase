import {
  BudgetExceededError,
  RateLimitedError,
  ReconnectRequiredError,
  ValidationError,
} from '@xbase/core/errors';
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
import { getDiscoverySettings } from './discovery-settings';
import { xRequest } from './x-api-http';
import { getXApiSettings } from './x-api-settings';

// The one layer that reads X: posts, users, search and the home timeline. Every feature calls
// these functions, so every paid call passes the same budget check, is logged with its estimated
// cost, and uses the same per-account post cache. Tokens are the account's own (x-auth.ts renews
// them); the HTTP plumbing is x-api-http.ts.

/** The fields that make a post readable in full: its long body, its quotes and its engagement. */
const TWEET_FIELDS =
  'created_at,public_metrics,author_id,conversation_id,lang,attachments,referenced_tweets,note_tweet';
const USER_FIELDS = 'profile_image_url,public_metrics';
/** Authors, the posts they quote, and those posts' authors: a quote never arrives without one. */
const EXPANSIONS = 'author_id,referenced_tweets.id,referenced_tweets.id.author_id';

/** A quoted post, with the full body and author a feature needs to read it. */
export type XQuotedPost = {
  id: string;
  authorId: string;
  authorUsername: string | null;
  text: string;
};

/** One post as the read layer returns it. `data` keeps X's response for later normalization. */
export type XPost = {
  id: string;
  authorId: string;
  authorUsername: string | null;
  /** The full body: X's `note_tweet` text for a long post, otherwise `text`. */
  text: string;
  createdAt: string | null;
  metrics: Record<string, number> | null;
  /** The post this one quotes, with its own full text and author; null when it quotes none. */
  quotedPost: XQuotedPost | null;
  /** When this copy was read from X; a cache hit keeps the earlier time. */
  fetchedAt: string;
  /** The raw tweet, as X returned it. */
  data: unknown;
};

export type XUser = {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
  metrics: Record<string, number> | null;
};

/** One account someone follows: enough for the follow flag a discovery run stores. */
export type XFollow = { id: string; username: string };

export type XPage = { posts: XPost[]; users: XUser[] };

export type XPostsResult = XPage & {
  /** How many of the requested posts the cache answered, so a caller can report the saving. */
  cached: number;
};

/** Why a timeline run stopped after a page instead of finishing every page the owner asked for. */
export type XTimelineStop =
  | {
      reason: 'budget';
      scope: 'account' | 'workspace';
      cap: 'daily' | 'monthly';
      resetAt: string;
      message: string;
    }
  | { reason: 'rate_limit'; resetAt: string; message: string }
  | { reason: 'reconnect'; message: string };

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
  /** A long post's body; `text` is then only its truncated preview. */
  note_tweet: z.looseObject({ text: z.string() }).optional(),
  referenced_tweets: z.array(z.looseObject({ type: z.string(), id: z.string() })).optional(),
});

const UserSchema = z.looseObject({
  id: z.string().min(1),
  username: z.string().min(1),
  name: z.string(),
  profile_image_url: z.string().optional(),
  public_metrics: z.record(z.string(), z.number()).optional(),
});

const QuotedPostSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorUsername: z.string().nullable(),
  text: z.string(),
});

/** What x_posts keeps: the tweet as X returned it and the quote resolved when it was read. */
const CachedPostData = z.object({
  tweet: TweetSchema,
  quotedPost: QuotedPostSchema.nullable(),
});

const TweetPage = z.looseObject({
  data: z.array(TweetSchema).optional(),
  includes: z
    .looseObject({
      users: z.array(UserSchema).optional(),
      tweets: z.array(TweetSchema).optional(),
    })
    .optional(),
  meta: z.looseObject({ next_token: z.string().optional() }).optional(),
});

const UserPage = z.looseObject({
  data: z.array(UserSchema).optional(),
});

const FollowPage = z.looseObject({
  data: z.array(z.looseObject({ id: z.string().min(1), username: z.string().min(1) })).optional(),
  meta: z.looseObject({ next_token: z.string().optional() }).optional(),
});

type RawTweet = z.infer<typeof TweetSchema>;
type RawUser = z.infer<typeof UserSchema>;

/** One post and the tweet it came from, so it can be cached as X returned it. */
type ParsedPost = { post: XPost; tweet: RawTweet };

const toUser = (user: RawUser): XUser => ({
  id: user.id,
  username: user.username,
  name: user.name,
  profileImageUrl: user.profile_image_url ?? null,
  metrics: user.public_metrics ?? null,
});

/** A long post's body lives in `note_tweet`; `text` is only its truncated preview. */
const fullText = (tweet: RawTweet): string => tweet.note_tweet?.text ?? tweet.text;

/** The post `tweet` quotes, looked up among the response's included posts and their authors. */
function quotedPostOf(
  tweet: RawTweet,
  included: Map<string, RawTweet>,
  users: Map<string, XUser>,
): XQuotedPost | null {
  const id = tweet.referenced_tweets?.find(({ type }) => type === 'quoted')?.id;
  const quoted = id === undefined ? undefined : included.get(id);
  if (!quoted) return null;
  return {
    id: quoted.id,
    authorId: quoted.author_id ?? '',
    authorUsername: quoted.author_id ? (users.get(quoted.author_id)?.username ?? null) : null,
    text: fullText(quoted),
  };
}

function toParsedPost(
  tweet: RawTweet,
  included: Map<string, RawTweet>,
  users: Map<string, XUser>,
  fetchedAt: Date,
): ParsedPost {
  return {
    post: {
      id: tweet.id,
      authorId: tweet.author_id ?? '',
      authorUsername: tweet.author_id ? (users.get(tweet.author_id)?.username ?? null) : null,
      text: fullText(tweet),
      createdAt: tweet.created_at ?? null,
      metrics: tweet.public_metrics ?? null,
      quotedPost: quotedPostOf(tweet, included, users),
      fetchedAt: fetchedAt.toISOString(),
      data: tweet,
    },
    tweet,
  };
}

const emptyIncluded = new Map<string, RawTweet>();

/** Whether a post quotes another: X expands one level, so an include can't resolve its own. */
const quotesAnother = (tweet: RawTweet): boolean =>
  tweet.referenced_tweets?.some(({ type }) => type === 'quoted') ?? false;

/**
 * X's answer as posts, authors and the next page; a shape XBase can't read is an error. Quoted
 * posts arrive in `includes.tweets` and come back on the post, so no feature has to fetch them.
 */
function parsePostPage(
  body: unknown,
  fetchedAt = new Date(),
): XPage & { nextToken: string | null; rows: ParsedPost[] } {
  const parsed = TweetPage.safeParse(body);
  if (!parsed.success) throw new Error('X answered in a shape XBase doesn’t understand.');
  const users = (parsed.data.includes?.users ?? []).map(toUser);
  const byId = new Map(users.map((user) => [user.id, user]));
  const included = parsed.data.includes?.tweets ?? [];
  const quotes = new Map(included.map((tweet) => [tweet.id, tweet]));
  const posts = (parsed.data.data ?? []).map((tweet) =>
    toParsedPost(tweet, quotes, byId, fetchedAt),
  );
  // Cache the quotes too, so asking for one by id is a cache hit rather than a new read. An
  // include that quotes another can't resolve that quote here: caching it would answer a later
  // read with no quote, and would overwrite the copy a direct read already resolved.
  const returned = new Set(posts.map(({ tweet }) => tweet.id));
  const rows = [...posts];
  for (const tweet of included) {
    if (returned.has(tweet.id) || quotesAnother(tweet)) continue;
    rows.push(toParsedPost(tweet, emptyIncluded, byId, fetchedAt));
  }
  return {
    posts: posts.map(({ post }) => post),
    users,
    nextToken: parsed.data.meta?.next_token ?? null,
    rows,
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
  const parsed = CachedPostData.safeParse(row.data);
  // A row written before full text and quotes were kept has no `tweet`: read it again once.
  if (!parsed.success) return null;
  const { tweet, quotedPost } = parsed.data;
  return {
    id: row.postId,
    authorId: row.authorId ?? tweet.author_id ?? '',
    authorUsername: row.authorUsername,
    text: row.text,
    createdAt: tweet.created_at ?? null,
    metrics: tweet.public_metrics ?? null,
    quotedPost,
    fetchedAt: row.fetchedAt.toISOString(),
    data: tweet,
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

function cachePosts(accountId: string, rows: ParsedPost[], fetchedAt: Date): void {
  if (rows.length === 0) return;
  const db = getDb();
  db.transaction((tx) => {
    for (const { post, tweet } of rows) {
      const values = {
        accountId,
        postId: post.id,
        authorId: post.authorId || null,
        authorUsername: post.authorUsername,
        text: post.text,
        data: { tweet, quotedPost: post.quotedPost },
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
      : chunks(wanted, X_POSTS_PER_CALL).flatMap((chunk) =>
          readCachedPosts(accountId, chunk, new Date(Date.now() - windowMinutes * 60_000)),
        );
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
      params: { ids: chunk.join(','), 'tweet.fields': TWEET_FIELDS, expansions: EXPANSIONS },
      feature,
      cost: (payload) => postCost(accountId, parsePostPage(payload).posts),
    });
    const fetchedAt = new Date();
    const page = parsePostPage(body, fetchedAt);
    cachePosts(accountId, page.rows, fetchedAt);
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

/**
 * Recent search reaches seven days back from when X receives the request, and rejects an older
 * `start_time`: a minute's margin covers the time a run spends before the request goes out.
 */
const RECENT_SEARCH_REACH_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 1000;

const searchStart = (since: Date): Date =>
  new Date(Math.max(since.getTime(), Date.now() - RECENT_SEARCH_REACH_MS));

/**
 * One page of recent search, newest first, at most the tier's 25 results. `since` is sent as
 * `start_time`, so X never bills posts a caller would throw away as too old; one older than
 * search reaches is sent as the oldest it accepts.
 */
export async function searchRecent(
  accountId: string,
  query: string,
  { feature, since }: { feature: XApiFeature; since?: Date },
): Promise<XPage> {
  if (!query.trim()) throw new ValidationError('Write a search query first.');
  const body = await xRequest({
    accountId,
    endpoint: 'GET /2/tweets/search/recent',
    path: '/tweets/search/recent',
    params: {
      query: query.trim(),
      max_results: String(X_SEARCH_RESULTS_PER_CALL),
      sort_order: 'recency',
      ...(since ? { start_time: searchStart(since).toISOString() } : {}),
      'tweet.fields': TWEET_FIELDS,
      expansions: EXPANSIONS,
    },
    feature,
    cost: (payload) => postCost(accountId, parsePostPage(payload).posts),
  });
  const fetchedAt = new Date();
  const page = parsePostPage(body, fetchedAt);
  cachePosts(accountId, page.rows, fetchedAt);
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

/** The follow list's ceiling: ten pages of 1,000 accounts is far more than a run needs. */
const MAX_FOLLOWING_PAGES = 10;

/**
 * Every account `accountId` follows, in pages of 1,000. Needs the follows.read scope, which an
 * account linked before that scope existed doesn't have: the caller checks first and treats the
 * list as unknown rather than asking X. Follower reads are the cheapest kind, at $0.001 each, so
 * 1,000 follows cost about a dollar; discovery caches the list for a day.
 */
export async function getFollowing(
  accountId: string,
  { feature }: { feature: XApiFeature },
): Promise<XFollow[]> {
  const follows: XFollow[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < MAX_FOLLOWING_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are paid calls: each passes the cap check before the next sends
    const body = await xRequest({
      accountId,
      endpoint: 'GET /2/users/:id/following',
      path: `/users/${encodeURIComponent(accountId)}/following`,
      params: {
        max_results: '1000',
        'user.fields': USER_FIELDS,
        ...(nextToken ? { pagination_token: nextToken } : {}),
      },
      feature,
      cost: (payload) => {
        const parsed = FollowPage.safeParse(payload);
        const read = parsed.success ? (parsed.data.data ?? []) : [];
        return {
          itemCount: read.length,
          costMicros: estimateReadCostMicros({ ownItems: read.length }),
        };
      },
    });
    const parsed = FollowPage.safeParse(body);
    if (!parsed.success) throw new Error('X answered in a shape XBase doesn’t understand.');
    follows.push(...(parsed.data.data ?? []).map(({ id, username }) => ({ id, username })));
    nextToken = parsed.data.meta?.next_token ?? undefined;
    if (!nextToken) break;
  }
  return follows;
}

/**
 * The home timeline, one paid page at a time. `pages` defaults to the account's setting (one page
 * unless raised). A cap, a 429 or a rejected token after the first page returns what was read with
 * `stop` set, so a running job finishes its page and then stops instead of losing it. Replies and
 * plain reposts are excluded at X: discovery never keeps them, so they should never be billed.
 * `since` is sent as `start_time`.
 */
export async function homeTimeline(
  accountId: string,
  { feature, pages, since }: { feature: XApiFeature; pages?: number; since?: Date },
): Promise<XTimelineRun> {
  const wanted = Math.min(
    Math.max(1, Math.trunc(pages ?? getDiscoverySettings(accountId).sources.homeTimelinePages)),
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
          exclude: 'replies,retweets',
          ...(since ? { start_time: since.toISOString() } : {}),
          'tweet.fields': TWEET_FIELDS,
          expansions: EXPANSIONS,
          ...(nextToken ? { pagination_token: nextToken } : {}),
        },
        feature,
        cost: (payload) => postCost(accountId, parsePostPage(payload).posts),
      });
      const fetchedAt = new Date();
      const parsed = parsePostPage(body, fetchedAt);
      cachePosts(accountId, parsed.rows, fetchedAt);
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
          scope: error.scope,
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
      if (error instanceof ReconnectRequiredError) {
        stop = { reason: 'reconnect', message: error.message };
        break;
      }
      throw error;
    }
  }

  return { posts, users, pagesFetched, stop };
}
