import { MAX_STYLE_FIELD_LENGTH, type StyleGuide } from '@xbase/ai/profile';
import {
  DECISION_PROVIDER_IDS,
  type DecisionProvider,
  type ModelOption,
  type ProviderId,
} from '@xbase/ai/providers';
import { z } from 'zod';
import { hasText, MAX_PART_LENGTH } from './posts/schema';

// Shared by the settings page, the composer and the server: no server imports.

/** The providers that write: their keys come from the server's environment. */
export const WRITING_PROVIDERS = [
  'openai',
  'anthropic',
  'xai',
  'openrouter',
] as const satisfies readonly ProviderId[];
export type WritingProvider = (typeof WRITING_PROVIDERS)[number];

/** Where each provider's key goes in .env. */
export const KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  typesafe: 'TYPESAFE_API_KEY',
} as const satisfies Record<WritingProvider | DecisionProvider, string>;

/** The AI settings. Keys never leave the server: the UI only learns which providers have one. */
export type AiSettingsDto = {
  /** The writing providers with a key, in WRITING_PROVIDERS order. */
  available: WritingProvider[];
  /** What Refine with AI uses: the saved choice, else the first available provider's default. */
  writing: { provider: WritingProvider; model: ModelOption } | null;
  /** The decision providers with a key, in DECISION_PROVIDER_IDS order. */
  decisionProviders: DecisionProvider[];
  /** What decisions use: the saved choice, else the first available provider's default; null without any decision key. */
  decision: { provider: DecisionProvider; model: ModelOption } | null;
};

/** refineDraftFn's error when no provider has a key; the UI can link to Settings next to it. */
export const AI_NOT_CONFIGURED =
  'Add an AI provider’s API key to the server’s environment to use AI writing.';

const ModelOptionInput = z.object({
  id: z.string().trim().min(1, 'Pick a model').max(200),
  label: z.string().trim().min(1).max(200),
  lowEffort: z.boolean(),
});

export const SaveAiSettingsInput = z.object({
  provider: z.enum(WRITING_PROVIDERS, 'Pick a provider'),
  model: ModelOptionInput,
});

export const ListModelsInput = z.object({ provider: z.enum(WRITING_PROVIDERS, 'Pick a provider') });

const DecisionProviderInput = z.enum(DECISION_PROVIDER_IDS, 'Pick a provider');

export const SaveDecisionInput = z.object({
  provider: DecisionProviderInput,
  model: ModelOptionInput,
});

export const ListDecisionModelsInput = z.object({ provider: DecisionProviderInput });

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
