import { createServerFn } from '@tanstack/react-start';
import { validator } from '@/lib/validate';
import { CreateApiKeyInput, RevokeApiKeyInput } from './api-keys.schema';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.server';

// The settings page's entry points to api-keys.server.ts.

export const listApiKeysFn = createServerFn().handler(() => listApiKeys());

/** Answers with the plaintext key: show it once, it can't be read back. */
export const createApiKeyFn = createServerFn({ method: 'POST' })
  .validator(validator(CreateApiKeyInput))
  .handler(({ data }) => createApiKey(data.name));

export const revokeApiKeyFn = createServerFn({ method: 'POST' })
  .validator(validator(RevokeApiKeyInput))
  .handler(({ data }) => revokeApiKey(data.id));
