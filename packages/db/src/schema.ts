import { OAUTH_CLIENT_KINDS } from '@xbase/core/mcp';
import { POST_ORIGINS, POST_STATUSES } from '@xbase/core/posts/schema';
import { type SQL, sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  snakeCase,
  text,
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
  /** The account's style guide for AI writing; null until saved. */
  voice: text({ mode: 'json' }).$type<unknown>(),
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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthCode = typeof oauthCodes.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type XAccount = typeof xAccounts.$inferSelect;
