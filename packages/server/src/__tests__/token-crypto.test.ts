import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptToken, encryptToken } from '../token-crypto';

const env = vi.hoisted(() => ({ X_CLIENT_SECRET: 'client-secret' }));
vi.mock('../env', () => ({ getEnv: () => env }));

beforeEach(() => {
  env.X_CLIENT_SECRET = 'client-secret';
});

describe('token encryption', () => {
  it('round-trips, with a fresh IV every time', () => {
    const a = encryptToken('access-token', '1001:access');
    const b = encryptToken('access-token', '1001:access');
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(a).not.toContain('access-token');
    expect(a).not.toBe(b);
    expect(decryptToken(a, '1001:access')).toBe('access-token');
  });

  it('refuses a value moved to another row or field', () => {
    const sealed = encryptToken('access-token', '1001:access');
    expect(decryptToken(sealed, '2002:access')).toBeNull();
    expect(decryptToken(sealed, '1001:refresh')).toBeNull();
  });

  it('refuses a value sealed with another X_CLIENT_SECRET', () => {
    const sealed = encryptToken('access-token', '1001:access');
    env.X_CLIENT_SECRET = 'rotated-secret';
    expect(decryptToken(sealed, '1001:access')).toBeNull();
  });

  it.each(['', 'plain-token', 'v1.abc', 'v2.abc.def', 'v1.abc.de'])(
    'reads %j as nothing',
    (stored) => {
      expect(decryptToken(stored, '1001:access')).toBeNull();
    },
  );
});
