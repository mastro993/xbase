import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { clientIp } from '@/server/client-ip.server';
import { getDb } from '@/server/db/client.server';
import { sessions } from '@/server/db/schema';
import { getEnv } from '@/server/env.server';
import type { LoginError } from './auth.schema';
import { loginLimiter } from './rate-limit.server';

// Sessions are opaque random tokens in a cookie; the database keeps only their sha256, so a
// leaked database can't sign anyone in, and deleting rows signs devices out.
// Call these inside a request: a server function, a server route or middleware.

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Write last_seen_at at most this often, not on every request.
const TOUCH_MS = 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const hashToken = (token: string) => sha256(token).toString('hex');

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

/** Constant time: both sides are hashed to the same length before comparing. */
export function checkPassword(input: string): boolean {
  return timingSafeEqual(sha256(input), sha256(getEnv().APP_PASSWORD));
}

/** The current request's session, or null when signed out or expired. */
export function readSession(): { id: string } | null {
  const token = getCookie(sessionCookie().name);
  if (!token) return null;
  const db = getDb();
  const id = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  const now = new Date();
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_MS) {
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id)).run();
  }
  return { id };
}

/** Starts a new session and sets its cookie. Replaces the request's old session, if any. */
export function issueSession(): void {
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

/**
 * Checks the password and starts a session. Failures count per client (see clientIp): behind a
 * proxy without TRUST_PROXY_HOPS, everyone shares one counter, so anyone can pause sign-in.
 */
export function attemptLogin(password: string): LoginError | null {
  const ip = clientIp();
  if (loginLimiter.isLimited(ip)) return 'rate_limited';
  if (!checkPassword(password)) {
    loginLimiter.fail(ip);
    return 'invalid';
  }
  loginLimiter.reset(ip);
  issueSession();
  return null;
}
