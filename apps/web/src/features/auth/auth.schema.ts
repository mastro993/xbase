import { z } from 'zod';

// Shared by the login page and the server: no server imports here.

/**
 * Why signing in with X didn't work. denied: cancelled on X. not_linked: another X account owns
 * this XBase. expired: the attempt took too long or came from another browser. failed: X erred.
 */
export const SIGN_IN_ERRORS = ['denied', 'not_linked', 'expired', 'failed'] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number];

/** The login page's search params. Anything unexpected is dropped rather than failing. */
export const LoginSearch = z.object({
  next: z.string().optional().catch(undefined),
  error: z.enum(SIGN_IN_ERRORS).optional().catch(undefined),
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
