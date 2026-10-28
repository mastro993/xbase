import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { type Db, openDb } from '../client';
import { discoveryCandidates, posts, xAccounts } from '../schema';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const SCHEMA = fileURLToPath(new URL('../schema.ts', import.meta.url));
const TABLES = [
  'api_keys',
  'discovery_candidates',
  'followed_accounts',
  'oauth_clients',
  'oauth_codes',
  'oauth_grants',
  'oauth_tokens',
  'posts',
  'saved_search_runs',
  'saved_searches',
  'sessions',
  'settings',
  'suggested_posts',
  'x_accounts',
  'x_api_calls',
  'x_posts',
  'x_rate_limits',
];

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

// The app's tables, without drizzle's migrations journal and SQLite's own tables.
const tableNames = (db: Db) =>
  db
    .all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`)
    .map(({ name }) => name)
    .filter((name) => !name.startsWith('__') && !name.startsWith('sqlite_'));

// Every post belongs to an X account.
const ACCOUNT_ID = '1001';
const insertAccount = (db: Db) =>
  db
    .insert(xAccounts)
    .values({
      id: ACCOUNT_ID,
      username: 'user1001',
      name: 'User 1001',
      accessToken: 'access',
      tokenExpiresAt: new Date(),
      scope: 'tweet.read',
    })
    .run();

describe('migrations', () => {
  it('create every table on a fresh database file, in WAL mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'xbase-db-'));
    const db = openDb(join(dir, 'nested', 'xbase.db'), MIGRATIONS);
    expect(tableNames(db)).toEqual(TABLES);
    expect(db.get<{ journal_mode: string }>(sql`pragma journal_mode`)).toEqual({
      journal_mode: 'wal',
    });
    expect(db.get<{ foreign_keys: number }>(sql`pragma foreign_keys`)).toEqual({ foreign_keys: 1 });
    expect(db.get<{ timeout: number }>(sql`pragma busy_timeout`)).toEqual({ timeout: 5000 });
  });

  // It holds drafts, settings and the X accounts' (encrypted) tokens.
  it.skipIf(process.platform === 'win32')(
    'create the folder and the file readable only by the server’s user',
    () => {
      dir = mkdtempSync(join(tmpdir(), 'xbase-db-'));
      const path = join(dir, 'nested', 'xbase.db');
      openDb(path, MIGRATIONS);
      const mode = (file: string) => statSync(file).mode & 0o777;
      expect(mode(join(dir, 'nested'))).toBe(0o700);
      expect(mode(path)).toBe(0o600);
      expect(mode(`${path}-wal`)).toBe(0o600);
    },
  );

  it('are skipped when a database is already up to date', () => {
    dir = mkdtempSync(join(tmpdir(), 'xbase-db-'));
    const path = join(dir, 'xbase.db');
    const db = openDb(path, MIGRATIONS);
    insertAccount(db);
    db.insert(posts)
      .values({ accountId: ACCOUNT_ID, parts: [{ text: 'hello' }], origin: 'web' })
      .run();
    const reopened = openDb(path, MIGRATIONS);
    expect(reopened.select({ parts: posts.parts, status: posts.status }).from(posts).all()).toEqual(
      [{ parts: [{ text: 'hello' }], status: 'draft' }],
    );
  });

  // A database from before X sign-in: its password sessions would work again once someone claims
  // XBase, its posts and voice belong to no account, and its AI settings hold a plain-text key.
  it('upgrade a password-era database, signing everyone out and dropping the stored key', () => {
    dir = mkdtempSync(join(tmpdir(), 'xbase-db-'));
    const initOnly = join(dir, 'drizzle');
    cpSync(MIGRATIONS, initOnly, { recursive: true });
    for (const entry of readdirSync(initOnly).filter((folder) => !folder.endsWith('_init'))) {
      rmSync(join(initOnly, entry), { recursive: true });
    }
    const path = join(dir, 'xbase.db');
    const old = openDb(path, initOnly);
    old.run(
      sql`insert into sessions (id, created_at, expires_at, last_seen_at) values ('s', 1, 2, 1)`,
    );
    old.run(
      sql`insert into posts (id, parts, origin, created_at, updated_at) values ('p', '[]', 'web', 1, 1)`,
    );
    old.run(
      sql`insert into settings (key, value, updated_at) values ('ai', ${JSON.stringify({ provider: 'openai', model: { id: 'm', label: 'm', lowEffort: true }, apiKey: 'sk-secret' })}, 1), ('voice', '{}', 1)`,
    );
    const upgraded = openDb(path, MIGRATIONS);
    expect(upgraded.all(sql`select key, value from settings`)).toEqual([
      {
        key: 'ai',
        value: JSON.stringify({
          provider: 'openai',
          model: { id: 'm', label: 'm', lowEffort: true },
        }),
      },
    ]);
    expect(tableNames(upgraded)).toEqual(TABLES);
    expect(upgraded.all(sql`select id from sessions`)).toEqual([]);
    expect(upgraded.all(sql`select id from posts`)).toEqual([]);
    insertAccount(upgraded);
    upgraded
      .insert(posts)
      .values({ accountId: ACCOUNT_ID, parts: [{ text: 'hello' }], origin: 'web' })
      .run();
    expect(upgraded.select({ accountId: posts.accountId }).from(posts).all()).toEqual([
      { accountId: ACCOUNT_ID },
    ]);
  });

  // Adding the filters' CHECK rebuilds discovery_candidates: the candidates a run already stored
  // must come through, listed until a filter says otherwise.
  it('keep stored candidates when the exclusion reason arrives', () => {
    dir = mkdtempSync(join(tmpdir(), 'xbase-db-'));
    const before = join(dir, 'drizzle');
    cpSync(MIGRATIONS, before, { recursive: true });
    for (const entry of readdirSync(before).filter((folder) =>
      folder.endsWith('_discovery-filters'),
    )) {
      rmSync(join(before, entry), { recursive: true });
    }
    const path = join(dir, 'xbase.db');
    const old = openDb(path, before);
    insertAccount(old);
    old.run(
      sql`insert into saved_searches (id, name, query, created_at, updated_at) values ('s1', 'indie', 'saas', 1, 1)`,
    );
    old.run(
      sql`insert into discovery_candidates (id, account_id, x_post_id, source, saved_search_id, url, text, posted_at, fetched_at) values ('c1', ${ACCOUNT_ID}, 'p1', 'search', 's1', 'https://x.com/a/status/p1', 'hello', 1, 1)`,
    );

    const upgraded = openDb(path, MIGRATIONS);
    expect(
      upgraded
        .select({
          id: discoveryCandidates.id,
          savedSearchId: discoveryCandidates.savedSearchId,
          excludedReason: discoveryCandidates.excludedReason,
        })
        .from(discoveryCandidates)
        .all(),
    ).toEqual([{ id: 'c1', savedSearchId: 's1', excludedReason: null }]);
    expect(() =>
      upgraded.run(sql`update discovery_candidates set excluded_reason = 'nope' where id = 'c1'`),
    ).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          message: expect.stringContaining('CHECK constraint failed'),
        }),
      }),
    );
  });

  // Catches any schema.ts change committed without its migration: tables, columns, types, CHECK
  // enums, indexes, defaults. drizzle-kit diffs schema.ts against the last snapshot, here into a
  // copy of the migrations folder, and writes nothing when they agree.
  it('match schema.ts (run `pnpm db:generate --name <change>` after changing it)', () => {
    dir = mkdtempSync(join(tmpdir(), 'xbase-db-'));
    const out = join(dir, 'drizzle');
    cpSync(MIGRATIONS, out, { recursive: true });
    const kit = join(dirname(createRequire(import.meta.url).resolve('drizzle-kit')), 'bin.cjs');
    execFileSync(
      process.execPath,
      [kit, 'generate', '--dialect', 'sqlite', '--schema', SCHEMA, '--out', out],
      { cwd: dir, stdio: 'pipe' },
    );
    expect(new Set(readdirSync(out))).toEqual(new Set(readdirSync(MIGRATIONS)));
  }, 30_000);

  it('enforce enums with CHECK constraints', () => {
    const db = openDb(':memory:', MIGRATIONS);
    insertAccount(db);
    expect(() =>
      db
        .insert(posts)
        .values({ accountId: ACCOUNT_ID, parts: [], origin: 'fax' as 'web' })
        .run(),
    ).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          message: expect.stringContaining('CHECK constraint failed'),
        }),
      }),
    );
  });
});
