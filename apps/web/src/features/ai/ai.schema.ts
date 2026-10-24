import { MAX_STYLE_FIELD_LENGTH, type StyleGuide } from '@xbase/ai/profile';
import { type ModelOption, PROVIDER_IDS, type ProviderId } from '@xbase/ai/providers';
import { z } from 'zod';
import { hasText, MAX_PART_LENGTH } from '@/features/posts/posts.schema';

// Shared by the settings page, the composer and the server: no server imports.

/** The AI settings without the key, which never leaves the server. */
export type AiSettingsDto = { provider: ProviderId; model: ModelOption; keyHint: string } | null;

/** refineDraftFn's error when no provider is set up; the UI can link to Settings next to it. */
export const AI_NOT_CONFIGURED = 'Set up an AI provider in Settings to use AI writing.';

const Provider = z.enum(PROVIDER_IDS, 'Pick a provider');
const ApiKeyText = z.string().trim().min(1, 'Enter an API key').max(500, 'That key is too long');

const ModelOptionInput = z.object({
  id: z.string().trim().min(1, 'Pick a model').max(200),
  label: z.string().trim().min(1).max(200),
  lowEffort: z.boolean(),
});

/** Leave out apiKey to keep the stored key of the same provider. */
export const SaveAiSettingsInput = z.object({
  provider: Provider,
  model: ModelOptionInput,
  apiKey: ApiKeyText.optional(),
});

/** Leave out apiKey to use the stored key, when it's for the same provider. */
export const ListModelsInput = z.object({ provider: Provider, apiKey: ApiKeyText.optional() });

const StyleText = z
  .string()
  .trim()
  .max(MAX_STYLE_FIELD_LENGTH, `Each field can have at most ${MAX_STYLE_FIELD_LENGTH} characters`);
export const VoiceInput = z.object({
  persona: StyleText,
  audience: StyleText,
  voice: StyleText,
  rules: StyleText,
}) satisfies z.ZodType<StyleGuide>;

export const RefineDraftInput = z.object({
  text: z
    .string()
    .max(MAX_PART_LENGTH, 'That draft is too long to refine')
    .refine(hasText, 'Write something to refine first'),
});
