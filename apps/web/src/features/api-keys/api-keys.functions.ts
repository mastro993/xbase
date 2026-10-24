import { createServerFn } from '@tanstack/react-start';
import { CreateApiKeyInput, RevokeApiKeyInput } from '@xbase/core/api-keys';
import { validator } from '@xbase/core/validate';
import { createApiKey, listApiKeys, revokeApiKey } from '@xbase/server/api-keys';

// The settings page's entry points to @xbase/server/api-keys.

export const listApiKeysFn = createServerFn().handler(() => listApiKeys());

/** Answers with the plaintext key: show it once, it can't be read back. */
export const createApiKeyFn = createServerFn({ method: 'POST' })
  .validator(validator(CreateApiKeyInput))
  .handler(({ data }) => createApiKey(data.name));

export const revokeApiKeyFn = createServerFn({ method: 'POST' })
  .validator(validator(RevokeApiKeyInput))
  .handler(({ data }) => revokeApiKey(data.id));
