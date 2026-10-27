import type { AccountDto, AccountsDto } from '@xbase/core/accounts';
import { InvalidStateError, NotFoundError, ValidationError } from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import { type XAccount, xAccounts } from '@xbase/db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { setSessionAccount, type Session } from './sessions';
import { encryptToken } from './token-crypto';

// The X accounts linked to this XBase. Every linked account sees the whole workspace; posts and
// the voice belong to one account, everything else is shared.

/** Who signed in, from X's users/me. */
export type XProfile = { id: string; username: string; name: string; avatarUrl: string | null };

/** X's OAuth tokens for an account. */
export type XTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
};

const toDto = ({ id, username, name, avatarUrl }: XAccount): AccountDto => ({
  id,
  username,
  name,
  avatarUrl,
});

/** Oldest first: the first is the account that claimed this XBase. */
export function listAccounts(): AccountDto[] {
  return getDb()
    .select()
    .from(xAccounts)
    .orderBy(asc(xAccounts.createdAt), asc(xAccounts.id))
    .all()
    .map(toDto);
}

export function getAccounts(session: Session): AccountsDto {
  const accounts = listAccounts();
  const current = accounts.find(({ id }) => id === session.accountId);
  // readSession only returns a session with an existing account.
  if (!current) throw new NotFoundError('Account not found.');
  return { current, accounts };
}

export function accountExists(id: string): boolean {
  const db = getDb();
  return (
    db.select({ id: xAccounts.id }).from(xAccounts).where(eq(xAccounts.id, id)).get() !== undefined
  );
}

/** An account's tokens as stored (still encrypted) and the fields a read needs. */
export type XAccountCredentials = {
  id: string;
  username: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
};

/** The row a read works with; null when the account was removed. */
export function getAccountCredentials(id: string): XAccountCredentials | null {
  const row = getDb().select().from(xAccounts).where(eq(xAccounts.id, id)).get();
  return row
    ? {
        id: row.id,
        username: row.username,
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        expiresAt: row.tokenExpiresAt,
        scope: row.scope,
      }
    : null;
}

/**
 * Replaces an account's tokens after X refuses the old ones (a refresh rotates both). A response
 * without a refresh token keeps the stored one, as saveAccount does.
 */
export function saveAccountTokens(id: string, tokens: XTokens): void {
  const refreshToken =
    tokens.refreshToken === null ? null : encryptToken(tokens.refreshToken, `${id}:refresh`);
  getDb()
    .update(xAccounts)
    .set({
      accessToken: encryptToken(tokens.accessToken, `${id}:access`),
      refreshToken: refreshToken ?? sql`${xAccounts.refreshToken}`,
      tokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
      updatedAt: new Date(),
    })
    .where(eq(xAccounts.id, id))
    .run();
}

/**
 * Links a new account, or refreshes the profile and tokens of a linked one. Tokens are stored
 * encrypted (token-crypto.ts). An answer without a refresh token keeps the stored one, so a
 * later sign-in can't take away the scheduler's way to renew access.
 */
export function saveAccount(profile: XProfile, tokens: XTokens): void {
  const values = {
    username: profile.username,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    accessToken: encryptToken(tokens.accessToken, `${profile.id}:access`),
    tokenExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };
  const refreshToken =
    tokens.refreshToken === null
      ? null
      : encryptToken(tokens.refreshToken, `${profile.id}:refresh`);
  getDb()
    .insert(xAccounts)
    .values({ id: profile.id, ...values, refreshToken })
    .onConflictDoUpdate({
      target: xAccounts.id,
      set: {
        ...values,
        refreshToken: refreshToken ?? sql`${xAccounts.refreshToken}`,
        updatedAt: new Date(),
      },
    })
    .run();
}

export function switchAccount(session: Session, id: string): void {
  if (!accountExists(id)) throw new NotFoundError('Account not found.');
  setSessionAccount(session.id, id);
}

/**
 * Unlinks an account, deleting its posts and signing out every browser that signed in with it;
 * the browser removing it moves to another account. The last one stays: without it nobody could
 * sign in, and the next X account to try would claim this XBase.
 */
export function removeAccount(session: Session, id: string): void {
  const accounts = listAccounts();
  if (!accounts.some((account) => account.id === id)) {
    throw new NotFoundError('Account not found.');
  }
  const other = accounts.find((account) => account.id !== id);
  if (!other) {
    throw new InvalidStateError('XBase needs at least one account. Add another one first.');
  }
  if (session.accountId === id) setSessionAccount(session.id, other.id);
  getDb().delete(xAccounts).where(eq(xAccounts.id, id)).run();
}

const handles = (accounts: AccountDto[]) => accounts.map(({ username }) => `@${username}`);

/**
 * The account a REST or MCP call is for, by username (with or without the @, in any case).
 * Without one, the only linked account; with several, the caller has to say which.
 */
export function resolveAccountId(username?: string): string {
  const accounts = listAccounts();
  if (username === undefined) {
    const [only, ...others] = accounts;
    if (!only) throw new InvalidStateError('Sign in to XBase with an X account first.');
    if (others.length > 0) {
      throw new ValidationError(`Say which account: ${handles(accounts).join(', ')}.`);
    }
    return only.id;
  }
  const wanted = username.replace(/^@/, '').toLowerCase();
  const account = getDb()
    .select({ id: xAccounts.id })
    .from(xAccounts)
    .where(sql`lower(${xAccounts.username}) = ${wanted}`)
    .get();
  if (!account) {
    throw new ValidationError(
      `@${wanted} isn’t linked to XBase. Linked accounts: ${handles(accounts).join(', ')}.`,
    );
  }
  return account.id;
}

/** A list's account filter: undefined, every account, when no username is given. */
export const accountFilter = (username: string | undefined): string | undefined =>
  username === undefined ? undefined : resolveAccountId(username);
