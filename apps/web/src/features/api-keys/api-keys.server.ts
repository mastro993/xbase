import { createHash, randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client.server';
import { type ApiKey, apiKeys } from '@/server/db/schema';
import type { ApiKeyDto } from './api-keys.schema';

// REST API keys: `xbase_ak_` + 32 random bytes. Only the key's sha256 is stored, so the plaintext
// exists once, in createApiKey's answer, and a leaked database holds no usable key.

const KEY_PREFIX = 'xbase_ak_';
const KEY_PATTERN = /^xbase_ak_[\w-]{43}$/;
const PREFIX_LENGTH = 12;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

function toDto(row: ApiKey): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

/** Returns the plaintext key once; it can't be read back later. */
export function createApiKey(name: string): { key: string; apiKey: ApiKeyDto } {
  const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const row = getDb()
    .insert(apiKeys)
    .values({ name, prefix: key.slice(0, PREFIX_LENGTH), tokenHash: hashKey(key) })
    .returning()
    .get();
  return { key, apiKey: toDto(row) };
}

/** Newest first. */
export function listApiKeys(): ApiKeyDto[] {
  return getDb()
    .select()
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
    .all()
    .map(toDto);
}

/** Deletes the key; a key that's already gone is fine. */
export function revokeApiKey(id: string): void {
  getDb().delete(apiKeys).where(eq(apiKeys.id, id)).run();
}

/**
 * The key's row, with last_used_at set to now, or null. The lookup compares sha256 digests: a
 * caller can't steer a digest's bytes, so its timing says nothing about stored keys, and no
 * constant-time compare is needed.
 */
export function verifyApiKey(token: string): ApiKeyDto | null {
  if (!KEY_PATTERN.test(token)) return null;
  const row = getDb()
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.tokenHash, hashKey(token)))
    .returning()
    .get();
  return row ? toDto(row) : null;
}
