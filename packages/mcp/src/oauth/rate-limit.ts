export type RateLimiter = {
  isLimited: (key: string, now?: number) => boolean;
  fail: (key: string, now?: number) => void;
  reset: (key: string) => void;
};

// The most keys a limiter remembers. Each takes ~100 bytes, so a flood of new addresses can't
// grow the map without bound; past this, the keys that have been counting longest go first.
const MAX_KEYS = 10_000;

/**
 * Counts failures per key in a fixed window that starts at the first failure. In memory: a
 * restart clears it, which is fine for one server and one owner.
 */
export function createRateLimiter({
  max,
  windowMs,
}: {
  max: number;
  windowMs: number;
}): RateLimiter {
  const failures = new Map<string, { count: number; resetAt: number }>();

  const current = (key: string, now: number) => {
    const entry = failures.get(key);
    if (entry && entry.resetAt <= now) failures.delete(key);
    return entry && entry.resetAt > now ? entry : undefined;
  };

  return {
    isLimited: (key, now = Date.now()) => (current(key, now)?.count ?? 0) >= max,
    fail(key, now = Date.now()) {
      const entry = current(key, now);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, resetAt: now + windowMs });
      // Every window has the same length, so insertion order is expiry order: drop finished
      // windows from the front, then the oldest live ones while the map is over its cap.
      for (const [other, { resetAt }] of failures) {
        if (resetAt > now && failures.size <= MAX_KEYS) break;
        failures.delete(other);
      }
    },
    reset: (key) => void failures.delete(key),
  };
}

// Limits for the public OAuth endpoints, per client (resolveClientIp in @xbase/server/client-ip).
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
