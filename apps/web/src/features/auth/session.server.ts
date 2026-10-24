import { createHash, randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client.server';
import { sessions, xAccounts } from '@/server/db/schema';
import { getEnv } from '@/server/env.server';
import { jsonError } from '@/server/http';

// Sessions are opaque random tokens in a cookie; the database keeps only their sha256, so a
// leaked database can't sign anyone in, and deleting rows signs devices out.
// Call these inside a request: a server function, a server route or middleware.

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Write last_seen_at at most this often, not on every request.
const TOUCH_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A signed-in browser, and the X account it works as. */
export type Session = { id: string; accountId: string };

/**
 * The session cookie's name and flags. `__Host-` and Secure need HTTPS, so a plain-HTTP LAN
 * install gets a plain name. Lax, not Strict: the MCP consent page is reached from another site.
 */
export function sessionCookie() {
  const secure = new URL(getEnv().APP_URL).protocol === 'https:';
  return {
    name: secure ? '__Host-xbase_session' : 'xbase_session',
    options: { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const,
  };
}

/** The oldest linked account: where a session lands when its own account was removed. */
export function firstAccountId(): string | null {
  const db = getDb();
  const first = db
    .select({ id: xAccounts.id })
    .from(xAccounts)
    .orderBy(asc(xAccounts.createdAt), asc(xAccounts.id))
    .get();
  return first?.id ?? null;
}

/**
 * The current request's session, or null when signed out or expired. With no account left there
 * is nothing to work as, so that counts as signed out too.
 */
export function readSession(): Session | null {
  const token = getCookie(sessionCookie().name);
  if (!token) return null;
  const db = getDb();
  const id = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  const now = new Date();
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  const accountId = row.accountId ?? firstAccountId();
  if (!accountId) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_MS) {
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id)).run();
  }
  return { id, accountId };
}

/** For server functions: serverFnGuard already turned a signed-out call away. */
export function requireSession(): Session {
  const session = readSession();
  if (!session) throw jsonError(401, 'unauthorized', 'Sign in again.');
  return session;
}

/** Switches the session to another linked account. */
export function setSessionAccount(sessionId: string, accountId: string): void {
  getDb().update(sessions).set({ accountId }).where(eq(sessions.id, sessionId)).run();
}

/** Starts a new session as `accountId` and sets its cookie. Replaces the request's old session. */
export function issueSession(accountId: string): void {
  const { name, options } = sessionCookie();
  const db = getDb();
  const previous = getCookie(name);
  if (previous) {
    db.delete(sessions)
      .where(eq(sessions.id, hashToken(previous)))
      .run();
  }
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  db.insert(sessions)
    .values({
      id: hashToken(token),
      accountId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + TTL_MS),
      lastSeenAt: now,
    })
    .run();
  setCookie(name, token, { ...options, maxAge: TTL_MS / 1000 });
}

/** Ends the request's session and clears its cookie. */
export function revokeSession(): void {
  const { name, options } = sessionCookie();
  const token = getCookie(name);
  if (token) {
    getDb()
      .delete(sessions)
      .where(eq(sessions.id, hashToken(token)))
      .run();
  }
  deleteCookie(name, options);
}

/** Signs every device out. */
export function revokeAllSessions(): void {
  getDb().delete(sessions).run();
}
