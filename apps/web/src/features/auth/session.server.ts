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
 * The name and flags of an auth cookie. `__Host-` and Secure need HTTPS, so a plain-HTTP LAN
 * install gets a plain name; browsers don't scope cookies by port, so the port joins that name
 * and two dev servers on 127.0.0.1 keep their own sessions and sign-in flows. Lax, not Strict:
 * the MCP consent page is reached from another site.
 */
export function authCookie(base: string) {
  const url = new URL(getEnv().APP_URL);
  const secure = url.protocol === 'https:';
  return {
    name: secure ? `__Host-${base}` : url.port ? `${base}_${url.port}` : base,
    options: { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const,
  };
}

/** The session cookie's name and flags. */
export function sessionCookie() {
  return authCookie('xbase_session');
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
