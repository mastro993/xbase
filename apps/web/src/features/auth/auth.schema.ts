import { z } from 'zod';

// Shared by the login page and the server: no server imports here.

export const LOGIN_ERRORS = ['invalid', 'rate_limited'] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

/** The login page's search params. Anything unexpected is dropped rather than failing. */
export const LoginSearch = z.object({
  next: z.string().optional().catch(undefined),
  error: z.enum(LOGIN_ERRORS).optional().catch(undefined),
});

const BASE = 'http://xbase.invalid';

/**
 * Where to go after signing in: a path on this site, or `/`. Parsed the way a browser would, so
 * `//evil.example`, `/\evil.example` and tab or newline tricks can't leave the site. Dot segments
 * can collapse into a leading `//` (`/.//evil.example`), so the result is checked too.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  try {
    const url = new URL(value, BASE);
    const offSite = url.origin !== BASE || /^\/[/\\]/.test(url.pathname);
    return offSite ? '/' : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

const MAX_PASSWORD = 1024;

/** Reads the login form. Never throws on bad input: a missing password is a wrong one. */
export function parseLoginForm(data: unknown): { password: string; next: string } {
  if (!(data instanceof FormData)) throw new Error('Expected form data');
  const password = data.get('password');
  return {
    password: typeof password === 'string' && password.length <= MAX_PASSWORD ? password : '',
    next: safeNext(data.get('next')),
  };
}
