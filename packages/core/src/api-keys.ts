import { z } from 'zod';

// Shared by the settings UI and the server: no server imports.

/** A key as the settings page lists it. The key itself is shown once, when it's created. */
export type ApiKeyDto = {
  id: string;
  name: string;
  /** The key's first characters, to tell keys apart. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export const MAX_API_KEY_NAME = 60;

export const CreateApiKeyInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name the key, e.g. "Backup script"')
    .max(MAX_API_KEY_NAME, `A name can have at most ${MAX_API_KEY_NAME} characters`),
});
export const RevokeApiKeyInput = z.object({ id: z.string().min(1).max(100) });
