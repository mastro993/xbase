import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../rate-limit.server';

const MINUTE = 60_000;

describe('createRateLimiter', () => {
  it('limits a key after max failures in the window', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 15 * MINUTE });
    for (let i = 0; i < 3; i++) {
      expect(limiter.isLimited('a', 0)).toBe(false);
      limiter.fail('a', i * MINUTE);
    }
    expect(limiter.isLimited('a', 3 * MINUTE)).toBe(true);
    expect(limiter.isLimited('b', 3 * MINUTE)).toBe(false);
  });

  it('starts over once the window from the first failure has passed', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 15 * MINUTE });
    limiter.fail('a', 0);
    limiter.fail('a', 10 * MINUTE);
    expect(limiter.isLimited('a', 15 * MINUTE - 1)).toBe(true);
    expect(limiter.isLimited('a', 15 * MINUTE)).toBe(false);
    limiter.fail('a', 15 * MINUTE);
    expect(limiter.isLimited('a', 15 * MINUTE)).toBe(false);
  });

  it('forgets a key on reset', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: MINUTE });
    limiter.fail('a', 0);
    expect(limiter.isLimited('a', 0)).toBe(true);
    limiter.reset('a');
    expect(limiter.isLimited('a', 0)).toBe(false);
  });

  it('keeps counting live keys when it drops finished ones', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: MINUTE });
    for (let i = 0; i < 1001; i++) limiter.fail(`old-${i}`, -2 * MINUTE);
    limiter.fail('live', 0);
    limiter.fail('trigger', 0);
    expect(limiter.isLimited('live', 0)).toBe(true);
    expect(limiter.isLimited('old-0', 0)).toBe(false);
  });

  it('forgets the oldest keys past 10,000, so rotating addresses can’t grow it for ever', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 15 * MINUTE });
    for (let i = 0; i <= 10_000; i++) limiter.fail(`key-${i}`, 0);
    expect(limiter.isLimited('key-0', 0)).toBe(false);
    expect(limiter.isLimited('key-1', 0)).toBe(true);
    expect(limiter.isLimited('key-10000', 0)).toBe(true);
  });
});
