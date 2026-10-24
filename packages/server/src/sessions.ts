import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '@xbase/db/client';
import { sessions } from '@xbase/db/schema';
import { eq } from 'drizzle-orm';

// Sessions are opaque random tokens; the database keeps only their sha256, so a leaked database
// can't sign anyone in, and deleting rows signs devices out. The web app carries the token in a
// cookie.

/** How long a session lasts after it starts. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Write last_seen_at at most this often, not on every request.
const TOUCH_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A signed-in browser, and the X account it works as. */
export type Session = { id: string; accountId: string };

/** The token's session, or null when it's unknown or expired. */
export function findSession(token: string): Session | null {
  const db = getDb();
  const id = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  const now = new Date();
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_MS) {
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id)).run();
  }
  return { id, accountId: row.accountId };
}

/** Starts a session as `accountId` and returns its token, which only the caller ever sees. */
export function createSession(accountId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  getDb()
    .insert(sessions)
    .values({
      id: hashToken(token),
      accountId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      lastSeenAt: now,
    })
    .run();
  return token;
}

/** Ends the token's session; an unknown token is fine. */
export function deleteSession(token: string): void {
  getDb()
    .delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .run();
}

/** Signs every device out. */
export function deleteAllSessions(): void {
  getDb().delete(sessions).run();
}

/** Switches the session to another linked account. */
export function setSessionAccount(sessionId: string, accountId: string): void {
  getDb().update(sessions).set({ accountId }).where(eq(sessions.id, sessionId)).run();
}
