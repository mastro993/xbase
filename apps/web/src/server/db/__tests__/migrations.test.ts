import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../client.server';
import { posts } from '../schema';

const MIGRATIONS = fileURLToPath(new URL('../../../../drizzle', import.meta.url));
const SCHEMA = fileURLToPath(new URL('../schema.ts', import.meta.url));
const TABLES = [
  'api_keys',
  'oauth_clients',
  'oauth_codes',
  'oauth_grants',
  'oauth_tokens',
  'posts',
  'saved_searches',
  'sessions',
  'settings',
];

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

// The app's tables, without drizzle's migrations journal and SQLite's own tables.
const tableNames = (db: ReturnType<typeof openDb>) =>
  db
    .all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`)
    .map(({ name }) => name)
    .filter((name) => !name.startsWith('__') && !name.startsWith('sqlite_'));

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

  // It holds the AI provider key in plain text.
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
    openDb(path, MIGRATIONS)
      .insert(posts)
      .values({ parts: [{ text: 'hello' }], origin: 'web' })
      .run();
    const reopened = openDb(path, MIGRATIONS);
    expect(reopened.select({ parts: posts.parts, status: posts.status }).from(posts).all()).toEqual(
      [{ parts: [{ text: 'hello' }], status: 'draft' }],
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
    expect(() =>
      db
        .insert(posts)
        .values({ parts: [], origin: 'fax' as 'web' })
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
