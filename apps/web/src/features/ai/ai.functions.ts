import { createServerFn } from '@tanstack/react-start';
import { validator } from '@/lib/validate';
import { ListModelsInput, RefineDraftInput, SaveAiSettingsInput, VoiceInput } from './ai.schema';
import {
  getAiSettings,
  getVoice,
  listModelsFor,
  refineDraft,
  saveAiSettings,
  saveVoice,
} from './ai.server';

// The settings page's and the composer's entry points to ai.server.ts. Anything carrying an API
// key is a POST, so the key stays out of URLs and logs.

/** null until a provider is saved. Never includes the key: keyHint shows its last 4 characters. */
export const getAiSettingsFn = createServerFn().handler(() => getAiSettings());

export const saveAiSettingsFn = createServerFn({ method: 'POST' })
  .validator(validator(SaveAiSettingsInput))
  .handler(({ data }) => saveAiSettings(data));

/** Also checks the key: an invalid one throws "Invalid API key". */
export const listModelsFn = createServerFn({ method: 'POST' })
  .validator(validator(ListModelsInput))
  .handler(({ data }) => listModelsFor(data));

export const getVoiceFn = createServerFn().handler(() => getVoice());

export const saveVoiceFn = createServerFn({ method: 'POST' })
  .validator(validator(VoiceInput))
  .handler(({ data }) => saveVoice(data));

/** Throws AI_NOT_CONFIGURED (ai.schema.ts) when no provider is set up. */
export const refineDraftFn = createServerFn({ method: 'POST' })
  .validator(validator(RefineDraftInput))
  .handler(async ({ data }) => ({ text: await refineDraft(data.text) }));
