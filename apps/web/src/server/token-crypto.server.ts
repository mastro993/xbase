import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { getEnv } from './env.server';

// X tokens at rest: AES-256-GCM with a key derived from X_CLIENT_SECRET, so the database alone
// can't post as an account. Each value is bound to its row and field (`context`), so a value
// copied into another row or column fails to decrypt. Rotating X_CLIENT_SECRET makes stored tokens
// unreadable; signing in again replaces them.

const VERSION = 'v1';

const key = () =>
  Buffer.from(hkdfSync('sha256', getEnv().X_CLIENT_SECRET, 'xbase', 'x-tokens', 32));

/** `v1.<iv>.<ciphertext and tag>`, base64url. */
export function encryptToken(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv).setAAD(Buffer.from(context));
  const sealed = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return [VERSION, iv.toString('base64url'), sealed.toString('base64url')].join('.');
}

/** Null when the value is malformed, belongs elsewhere, or was sealed with another secret. */
export function decryptToken(stored: string, context: string): string | null {
  const [version, iv, sealed] = stored.split('.');
  if (version !== VERSION || !iv || !sealed) return null;
  try {
    const bytes = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
      .setAAD(Buffer.from(context))
      .setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString();
  } catch {
    return null;
  }
}
