import { createRateLimiter, type RateLimiter } from '@/features/auth/rate-limit.server';

// Limits for the public OAuth endpoints, per client (clientIp in server/client-ip.server.ts).
// Behind a proxy without TRUST_PROXY_HOPS, every client shares the proxy's counter.

/** Every registration adds a row: 20 per hour. */
export const registerLimiter = createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
/** Real clients call the token endpoint a few times an hour: 120 a minute caps floods only. */
export const tokenLimiter = createRateLimiter({ max: 120, windowMs: 60 * 1000 });

/** Counts one request; true when the key is over its limit. */
export function overLimit(limiter: RateLimiter, key: string, now = Date.now()): boolean {
  if (limiter.isLimited(key, now)) return true;
  limiter.fail(key, now);
  return false;
}
