import { createHash } from 'node:crypto';
import { CreateApiKeyInput } from '@xbase/core/api-keys';
import { apiKeys } from '@xbase/db/schema';
import { createTestDb } from '@xbase/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from '../api-keys';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const NOW = new Date('2026-10-23T12:00:00.000Z');

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = createTestDb();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createApiKey', () => {
  it('returns the key once and stores only its sha256', () => {
    const { key, apiKey } = createApiKey('Chrome extension');
    expect(key).toMatch(/^xbase_ak_[\w-]{43}$/);
    expect(apiKey).toEqual({
      id: expect.any(String),
      name: 'Chrome extension',
      prefix: key.slice(0, 12),
      createdAt: NOW.toISOString(),
      lastUsedAt: null,
    });

    const [row] = db.select().from(apiKeys).all();
    expect(row?.tokenHash).toBe(sha256(key));
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it('makes a different key every time', () => {
    expect(createApiKey('a').key).not.toBe(createApiKey('b').key);
  });
});

describe('verifyApiKey', () => {
  it('accepts a live key and records when it was used', () => {
    const { key, apiKey } = createApiKey('cli');
    vi.setSystemTime(new Date(NOW.getTime() + 5000));
    expect(verifyApiKey(key)).toEqual({
      ...apiKey,
      lastUsedAt: new Date(NOW.getTime() + 5000).toISOString(),
    });
    expect(listApiKeys()[0]?.lastUsedAt).toBe(new Date(NOW.getTime() + 5000).toISOString());
  });

  it('rejects unknown, malformed and revoked keys', () => {
    const { key, apiKey } = createApiKey('cli');
    const other = `xbase_ak_${'A'.repeat(43)}`;
    for (const token of [other, '', key.slice(0, -1), `${key}x`, ` ${key}`, sha256(key)]) {
      expect(verifyApiKey(token)).toBeNull();
    }
    revokeApiKey(apiKey.id);
    expect(verifyApiKey(key)).toBeNull();
  });

  it('leaves last_used_at alone when the key is wrong', () => {
    createApiKey('cli');
    verifyApiKey(`xbase_ak_${'A'.repeat(43)}`);
    expect(listApiKeys()[0]?.lastUsedAt).toBeNull();
  });
});

describe('listApiKeys and revokeApiKey', () => {
  it('lists newest first and deletes on revoke, quietly for an unknown id', () => {
    const first = createApiKey('first').apiKey;
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    const second = createApiKey('second').apiKey;
    expect(listApiKeys().map(({ name }) => name)).toEqual(['second', 'first']);

    revokeApiKey(first.id);
    expect(listApiKeys()).toEqual([second]);
    expect(() => revokeApiKey('nope')).not.toThrow();
  });
});

describe('CreateApiKeyInput', () => {
  it('trims the name and needs 1–60 characters', () => {
    expect(CreateApiKeyInput.parse({ name: '  CLI  ' })).toEqual({ name: 'CLI' });
    expect(CreateApiKeyInput.safeParse({ name: '   ' }).success).toBe(false);
    expect(CreateApiKeyInput.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
  });
});
