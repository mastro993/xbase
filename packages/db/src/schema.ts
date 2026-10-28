import { CANDIDATE_SOURCES } from '@xbase/core/discover';
import { EXCLUSION_REASONS, MEMORY_STATUSES } from '@xbase/core/discovery-filters';
import { OAUTH_CLIENT_KINDS } from '@xbase/core/mcp';
import { POST_ORIGINS, POST_STATUSES } from '@xbase/core/posts/schema';
import { X_API_CALL_STATUSES, X_API_FEATURES } from '@xbase/core/x-api';
import { type SQL, sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  snakeCase,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Drizzle 1.0 sets the casing per table: camelCase keys become snake_case columns.
// Change a table here, then run `pnpm db:generate --name <change>` in apps/web and commit the
// migration it writes to drizzle/. Browser code may only `import type` from @xbase/db.

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamp = () => integer({ mode: 'timestamp_ms' });
const createdAt = () =>
  timestamp()
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  timestamp()
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

// text({ enum }) only narrows the TypeScript type; the CHECK makes SQLite enforce it too.
const oneOf = (column: AnySQLiteColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`;

/**
 * The X accounts linked to this XBase. The first to sign in claims it; more are added from
 * Settings, and any of them can sign in. Tokens are X's own, kept to call the API as the account.
 */
export const xAccounts = snakeCase.table('x_accounts', {
  id: text().primaryKey(), // X's user id: usernames can change
  username: text().notNull(),
  name: text().notNull(),
  avatarUrl: text(),
  accessToken: text().notNull(),
  refreshToken: text(),
  tokenExpiresAt: timestamp().notNull(),
  scope: text().notNull(),
  /** Set when X refused the account's access: no read is tried until it signs in again. */
  reconnectRequiredAt: timestamp(),
  /** The account's style guide for AI writing; null until saved. */
  voice: text({ mode: 'json' }).$type<unknown>(),
  /** The account's reply-discovery settings, one key per section; null until one is saved. */
  discovery: text({ mode: 'json' }).$type<unknown>(),
  /** When the account's follow list was last read; null until discovery reads it once. */
  followingRefreshedAt: timestamp(),
  /** When the account's mute and block lists were last read; null until discovery reads them. */
  hiddenAuthorsRefreshedAt: timestamp(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Browser sessions. The cookie holds a random token; only its sha256 is stored. */
export const sessions = snakeCase.table('sessions', {
  id: text().primaryKey(), // sha256 hex of the cookie token
  /** The account the browser works as; removing the account signs its browsers out. */
  accountId: text()
    .notNull()
    .references(() => xAccounts.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: timestamp().notNull(),
  lastSeenAt: timestamp().notNull(),
});

/** App settings as JSON values, one row per key (`ai`, `decision`, …). */
export const settings = snakeCase.table('settings', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/** REST API keys. Only the sha256 of a key is stored; revoking deletes the row. */
export const apiKeys = snakeCase.table('api_keys', {
  id: id(),
  name: text().notNull(),
  prefix: text().notNull(), // shown in the UI to tell keys apart
  tokenHash: text().notNull().unique(),
  createdAt: createdAt(),
  lastUsedAt: timestamp(),
});

/** MCP clients: registered through DCR (`dcr_…`) or a CIMD metadata URL used as the id. */
export const oauthClients = snakeCase.table(
  'oauth_clients',
  {
    clientId: text().primaryKey(),
    kind: text({ enum: OAUTH_CLIENT_KINDS }).notNull(),
    clientName: text().notNull(),
    redirectUris: text({ mode: 'json' }).$type<string[]>().notNull(),
    fetchedAt: timestamp(), // CIMD metadata cache time
    createdAt: createdAt(),
  },
  (t) => [check('oauth_clients_kind_ck', oneOf(t.kind, OAUTH_CLIENT_KINDS))],
);

/** Authorization codes, kept for a day after use so a replay can be detected. */
export const oauthCodes = snakeCase.table('oauth_codes', {
  codeHash: text().primaryKey(),
  clientId: text().notNull(),
  redirectUri: text().notNull(),
  codeChallenge: text().notNull(),
  scope: text().notNull(),
  resource: text().notNull(),
  expiresAt: timestamp().notNull(),
  usedAt: timestamp(),
  grantId: text(),
});

/** One per consent: a "connected app" in Settings. */
export const oauthGrants = snakeCase.table('oauth_grants', {
  id: id(),
  clientId: text()
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  scope: text().notNull(),
  resource: text().notNull(),
  createdAt: createdAt(),
  lastUsedAt: timestamp(),
  revokedAt: timestamp(),
});

export const OAUTH_TOKEN_KINDS = ['access', 'refresh'] as const;
export type OAuthTokenKind = (typeof OAUTH_TOKEN_KINDS)[number];

export const oauthTokens = snakeCase.table(
  'oauth_tokens',
  {
    tokenHash: text().primaryKey(),
    kind: text({ enum: OAUTH_TOKEN_KINDS }).notNull(),
    grantId: text()
      .notNull()
      .references(() => oauthGrants.id, { onDelete: 'cascade' }),
    expiresAt: timestamp().notNull(),
    rotatedAt: timestamp(),
    createdAt: createdAt(),
  },
  (t) => [
    check('oauth_tokens_kind_ck', oneOf(t.kind, OAUTH_TOKEN_KINDS)),
    index('oauth_tokens_grant_id_idx').on(t.grantId),
  ],
);

/** One post of a thread; a single post has one part. */
type PostPart = { text: string };

/** Each account's own posts: drafts, then scheduled, then published on X. */
export const posts = snakeCase.table(
  'posts',
  {
    id: id(),
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    status: text({ enum: POST_STATUSES }).notNull().default('draft'),
    parts: text({ mode: 'json' }).$type<PostPart[]>().notNull(),
    publishAt: timestamp(),
    publishedAt: timestamp(),
    xPostId: text(),
    error: text(),
    origin: text({ enum: POST_ORIGINS }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('posts_status_ck', oneOf(t.status, POST_STATUSES)),
    check('posts_origin_ck', oneOf(t.origin, POST_ORIGINS)),
    index('posts_account_status_publish_at_idx').on(t.accountId, t.status, t.publishAt),
  ],
);

/** X search queries the owner saved on the Discover page. */
export const savedSearches = snakeCase.table('saved_searches', {
  id: id(),
  name: text().notNull(),
  query: text().notNull(),
  /** A disabled search is kept, and skipped by every run. */
  enabled: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * The last run of one saved search, per account. Saved searches belong to the workspace, but the
 * candidates and their follow flags belong to one account, so each account reads its own run
 * time and count rather than another's.
 */
export const savedSearchRuns = snakeCase.table(
  'saved_search_runs',
  {
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    savedSearchId: text()
      .notNull()
      .references(() => savedSearches.id, { onDelete: 'cascade' }),
    lastRunAt: timestamp().notNull(),
    /** How many of that run's candidates the search holds for the account. */
    lastCandidateCount: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.savedSearchId] })],
);

/**
 * The accounts the user follows, cached per account so a run doesn't read the follow list on
 * every pass. `x_accounts.following_refreshed_at` is the cache's clock, so an account that
 * follows nobody still remembers when it last looked.
 */
export const followedAccounts = snakeCase.table(
  'followed_accounts',
  {
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    /** X's user id. */
    userId: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.userId] })],
);

/**
 * The accounts the user muted or blocked on X, cached per account like the follow list: discovery
 * never suggests their posts. `x_accounts.hidden_authors_refreshed_at` is the cache's clock.
 */
export const hiddenAuthors = snakeCase.table(
  'hidden_authors',
  {
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    /** X's user id: a muted account that renames stays muted. */
    userId: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.userId] })],
);

/**
 * Posts a discovery run kept as reply candidates: fresh original or quote posts, with their full
 * body and the post they quote. One row per post per account; `fetchedAt` is when X was read, so
 * a post read again inside the cache window keeps the earlier time.
 *
 * Changing a CHECK here rebuilds the table, so nothing may reference it: the owner's decisions
 * about a post live in `suggested_posts`, keyed by X's post id.
 */
export const discoveryCandidates = snakeCase.table(
  'discovery_candidates',
  {
    id: id(),
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    /** X's post id; unique within an account. */
    xPostId: text().notNull(),
    source: text({ enum: CANDIDATE_SOURCES }).notNull(),
    /** The saved search that found it; null for the home timeline, and when the search is gone. */
    savedSearchId: text().references(() => savedSearches.id, { onDelete: 'set null' }),
    /** The post on x.com. */
    url: text().notNull(),
    authorId: text(),
    authorHandle: text(),
    authorName: text(),
    authorFollowers: integer(),
    /** Whether the account follows the author; null when the follow list can't be read. */
    authorFollowing: integer({ mode: 'boolean' }),
    /** The full body, never X's truncated preview. */
    text: text().notNull(),
    lang: text(),
    postedAt: timestamp().notNull(),
    views: integer(),
    likes: integer(),
    replies: integer(),
    reposts: integer(),
    quotes: integer(),
    hasMedia: integer({ mode: 'boolean' }).notNull().default(false),
    isQuote: integer({ mode: 'boolean' }).notNull().default(false),
    conversationId: text(),
    quotedPostId: text(),
    quotedText: text(),
    quotedAuthorId: text(),
    quotedAuthorHandle: text(),
    fetchedAt: timestamp().notNull(),
    /**
     * The filter rule that keeps it out of the lists, or null when it is listed. Only the filters
     * write it, from the post and the settings, so a run or a settings change recomputes it.
     */
    excludedReason: text({ enum: EXCLUSION_REASONS }),
  },
  (t) => [
    check('discovery_candidates_source_ck', oneOf(t.source, CANDIDATE_SOURCES)),
    check('discovery_candidates_excluded_reason_ck', oneOf(t.excludedReason, EXCLUSION_REASONS)),
    uniqueIndex('discovery_candidates_account_post_uq').on(t.accountId, t.xPostId),
    index('discovery_candidates_account_search_posted_at_idx').on(
      t.accountId,
      t.savedSearchId,
      t.postedAt,
    ),
  ],
);

/**
 * What discovery remembers about a post for good, per account: shown in a batch, skipped, or
 * replied to. A remembered post is never suggested again, so nothing prunes this table; removing
 * the account forgets it. `createdAt` is when the post was first remembered and never changes;
 * a status only moves up (replied over skipped over shown).
 */
export const suggestedPosts = snakeCase.table(
  'suggested_posts',
  {
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    /** X's post id. */
    xPostId: text().notNull(),
    /** X's user id of the post's author. */
    authorId: text(),
    status: text({ enum: MEMORY_STATUSES }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.xPostId] }),
    check('suggested_posts_status_ck', oneOf(t.status, MEMORY_STATUSES)),
  ],
);

/**
 * Every read sent to X, with its estimated cost: the usage log in Settings and the source of the
 * spend caps. A cached post or a call blocked before it left costs nothing and has no row.
 */
export const xApiCalls = snakeCase.table(
  'x_api_calls',
  {
    id: id(),
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    /** The endpoint only, without its query: `GET /2/tweets`. */
    endpoint: text().notNull(),
    feature: text({ enum: X_API_FEATURES }).notNull(),
    itemCount: integer().notNull().default(0),
    /** Estimated in micro-dollars (1 µUSD = $0.000001), so sums don't drift. */
    costMicros: integer().notNull().default(0),
    status: text({ enum: X_API_CALL_STATUSES }).notNull(),
    /** X's answer when the call failed; never a token or a response body. */
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check('x_api_calls_feature_ck', oneOf(t.feature, X_API_FEATURES)),
    check('x_api_calls_status_ck', oneOf(t.status, X_API_CALL_STATUSES)),
    index('x_api_calls_account_created_at_idx').on(t.accountId, t.createdAt),
    index('x_api_calls_created_at_idx').on(t.createdAt),
  ],
);

/**
 * The last rate-limit headers X sent for an account's endpoint. Kept in the database so a restart
 * doesn't call an endpoint that is already throttled, and so Settings can show the window.
 */
export const xRateLimits = snakeCase.table(
  'x_rate_limits',
  {
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    endpoint: text().notNull(),
    limit: integer(),
    remaining: integer(),
    /** The short window (usually 15 minutes) resets at this time. */
    resetAt: timestamp(),
    /** X's per-user 24-hour window, when the endpoint reports one. */
    dayLimit: integer(),
    dayRemaining: integer(),
    dayResetAt: timestamp(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.endpoint] })],
);

/**
 * Posts read from X, kept per account so one account's reads never answer another's. `fetchedAt`
 * is the cache's freshness clock; a feature asks for `fresh: true` to pay for current engagement.
 */
export const xPosts = snakeCase.table(
  'x_posts',
  {
    accountId: text()
      .notNull()
      .references(() => xAccounts.id, { onDelete: 'cascade' }),
    /** X's post id; unique within an account. */
    postId: text().notNull(),
    authorId: text(),
    authorUsername: text(),
    /** The post's text as X returned it; the read layer keeps the raw response in `data`. */
    text: text().notNull(),
    data: text({ mode: 'json' }).$type<unknown>().notNull(),
    fetchedAt: timestamp().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.postId] }),
    index('x_posts_account_fetched_at_idx').on(t.accountId, t.fetchedAt),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type CachedPost = typeof xPosts.$inferSelect;
export type DiscoveryCandidate = typeof discoveryCandidates.$inferSelect;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthCode = typeof oauthCodes.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type SavedSearchRun = typeof savedSearchRuns.$inferSelect;
export type XAccount = typeof xAccounts.$inferSelect;
export type XApiCall = typeof xApiCalls.$inferSelect;
export type XRateLimit = typeof xRateLimits.$inferSelect;
