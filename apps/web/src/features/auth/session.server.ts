import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import { getEnv } from '@xbase/server/env';
import { jsonError } from '@xbase/server/http';
import {
  createSession,
  deleteSession,
  findSession,
  SESSION_TTL_MS,
  type Session,
} from '@xbase/server/sessions';

// The session token travels in a cookie (sessions.ts in @xbase/server keeps the rows).
// Call these inside a request: a server function, a server route or middleware.

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

/** The current request's session, or null when signed out or expired. */
export function readSession(): Session | null {
  const token = getCookie(sessionCookie().name);
  return token ? findSession(token) : null;
}

/** For server functions: serverFnGuard already turned a signed-out call away. */
export function requireSession(): Session {
  const session = readSession();
  if (!session) throw jsonError(401, 'unauthorized', 'Sign in again.');
  return session;
}

/** Starts a new session as `accountId` and sets its cookie. Replaces the request's old session. */
export function issueSession(accountId: string): void {
  const { name, options } = sessionCookie();
  const previous = getCookie(name);
  if (previous) deleteSession(previous);
  setCookie(name, createSession(accountId), { ...options, maxAge: SESSION_TTL_MS / 1000 });
}

/** Ends the request's session and clears its cookie. */
export function revokeSession(): void {
  const { name, options } = sessionCookie();
  const token = getCookie(name);
  if (token) deleteSession(token);
  deleteCookie(name, options);
}
