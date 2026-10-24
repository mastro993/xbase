import { createServerFn } from '@tanstack/react-start';
import { requireSession } from '@/features/auth/session.server';
import { validator } from '@/lib/validate';
import {
  ListModelsInput,
  RefineDraftInput,
  SaveAiSettingsInput,
  SaveDecisionInput,
  VoiceInput,
} from './ai.schema';
import {
  getAiSettings,
  getVoice,
  listDecisionModelsFor,
  listModelsFor,
  refineDraft,
  saveAiSettings,
  saveDecisionModel,
  saveVoice,
} from './ai.server';

// The settings page's and the composer's entry points to ai.server.ts. Provider keys stay in the
// server's environment; the voice is the account the browser works as.

export const getAiSettingsFn = createServerFn().handler(() => getAiSettings());

export const saveAiSettingsFn = createServerFn({ method: 'POST' })
  .validator(validator(SaveAiSettingsInput))
  .handler(({ data }) => saveAiSettings(data));

/** Also checks the key: one the provider refuses throws "Invalid API key". */
export const listModelsFn = createServerFn({ method: 'POST' })
  .validator(validator(ListModelsInput))
  .handler(({ data }) => listModelsFor(data));

export const saveDecisionFn = createServerFn({ method: 'POST' })
  .validator(validator(SaveDecisionInput))
  .handler(({ data }) => saveDecisionModel(data));

export const listDecisionModelsFn = createServerFn({ method: 'POST' }).handler(() =>
  listDecisionModelsFor(),
);

export const getVoiceFn = createServerFn().handler(() => getVoice(requireSession().accountId));

export const saveVoiceFn = createServerFn({ method: 'POST' })
  .validator(validator(VoiceInput))
  .handler(({ data }) => saveVoice(requireSession().accountId, data));

/** Throws AI_NOT_CONFIGURED (ai.schema.ts) when no provider has a key. */
export const refineDraftFn = createServerFn({ method: 'POST' })
  .validator(validator(RefineDraftInput))
  .handler(async ({ data }) => ({
    text: await refineDraft(requireSession().accountId, data.text),
  }));
