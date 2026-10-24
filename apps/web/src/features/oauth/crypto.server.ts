import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits in base64url, after an optional type prefix that secret scanners can match. */
export const newSecret = (prefix = '') => `${prefix}${randomBytes(32).toString('base64url')}`;

/**
 * Codes and tokens are stored as their sha256 only, so a leaked database holds nothing usable. A
 * secret with 256 random bits needs no salt or slow hash.
 */
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

// RFC 7636: 43 to 128 unreserved characters.
const VERIFIER = /^[\w.~-]{43,128}$/;

/** PKCE S256: base64url(sha256(verifier)) equals the challenge. `plain` is never accepted. */
export function pkceS256Matches(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  const expected = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
