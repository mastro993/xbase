import { listDecisionModels } from '@xbase/ai/decisions';
import { scrubSecrets } from '@xbase/ai/errors';
import { generateText, type LlmConfig, listModels } from '@xbase/ai/llm';
import { EMPTY_STYLE, type StyleGuide } from '@xbase/ai/profile';
import { cleanReply, refinePostPrompt } from '@xbase/ai/prompts';
import {
  DECISION_PROVIDERS,
  DECISION_PROVIDER_IDS,
  type DecisionProvider,
  type ModelOption,
  PROVIDERS,
} from '@xbase/ai/providers';
import {
  AI_NOT_CONFIGURED,
  type AiSettingsDto,
  KEY_ENV,
  ListDecisionModelsInput,
  SaveAiSettingsInput,
  SaveDecisionInput,
  VoiceInput,
  WRITING_PROVIDERS,
  type WritingProvider,
} from '@xbase/core/ai';
import { InvalidStateError, ValidationError } from '@xbase/core/errors';
import { parseInput } from '@xbase/core/validate';
import { getDb } from '@xbase/db/client';
import { settings, xAccounts } from '@xbase/db/schema';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { getEnv } from './env';

// AI writing, and decision models from TypeSafe, OpenAI and OpenRouter, with the owner's own
// provider keys. The keys live in the server's environment and are only ever used here: errors are
// scrubbed of them. The database keeps the choice of provider and model, workspace-wide, and each
// account's voice.

function readSetting<T>(key: string, schema: z.ZodType<T>): T | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  // A row this version can't read (hand-edited, older shape) counts as unset.
  const parsed = schema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

function writeSetting(key: string, value: unknown): void {
  getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run();
}

const keyFor = (provider: keyof typeof KEY_ENV): string | undefined => getEnv()[KEY_ENV[provider]];

/** The key, or a ValidationError naming the variable to set. */
function requireKey(provider: keyof typeof KEY_ENV): string {
  const key = keyFor(provider);
  if (!key)
    throw new ValidationError(`Set ${KEY_ENV[provider]} in the server’s environment first.`);
  return key;
}

const availableProviders = () => WRITING_PROVIDERS.filter((provider) => keyFor(provider));

type WritingConfig = LlmConfig & { provider: WritingProvider };

/** The saved provider while it still has a key, else the first provider with one. */
function writingConfig(): WritingConfig | null {
  const saved = readSetting('ai', SaveAiSettingsInput);
  const savedKey = saved && keyFor(saved.provider);
  if (saved && savedKey) return { ...saved, apiKey: savedKey };
  const [provider] = availableProviders();
  if (!provider) return null;
  return { provider, model: PROVIDERS[provider].defaultModel, apiKey: requireKey(provider) };
}

/** The decision provider and model saved, while its key is set, else the first provider with one. */
type DecisionConfig = { provider: DecisionProvider; model: ModelOption };

function availableDecisionProviders(): DecisionProvider[] {
  return DECISION_PROVIDER_IDS.filter((provider) => keyFor(provider));
}

function decisionConfig(): DecisionConfig | null {
  const saved = readSetting('decision', SaveDecisionInput);
  if (saved && keyFor(saved.provider)) {
    // A fixed-model provider keeps its current model, even when the stored one is from an older
    // release: every caller then sees the model that the API actually serves.
    const info = DECISION_PROVIDERS[saved.provider];
    return info.fixedModel ? { ...saved, model: info.defaultModel } : saved;
  }
  const [provider] = availableDecisionProviders();
  return provider ? { provider, model: DECISION_PROVIDERS[provider].defaultModel } : null;
}

// Provider error text can echo the key back: it reaches the browser scrubbed.
const MAX_ERROR = 300;
function providerError(error: unknown, apiKey: string): Error {
  const message = error instanceof Error ? error.message : 'The AI provider request failed.';
  return new Error(scrubSecrets(message, apiKey, MAX_ERROR));
}

export function getAiSettings(): AiSettingsDto {
  const writing = writingConfig();
  return {
    available: availableProviders(),
    writing: writing && { provider: writing.provider, model: writing.model },
    decisionProviders: availableDecisionProviders(),
    decision: decisionConfig(),
  };
}

export function saveAiSettings(input: z.infer<typeof SaveAiSettingsInput>): AiSettingsDto {
  const saved = parseInput(SaveAiSettingsInput, input);
  requireKey(saved.provider);
  writeSetting('ai', saved);
  return getAiSettings();
}

/** The provider's text models; doubles as a check of the key in the environment. */
export async function listModelsFor({
  provider,
}: {
  provider: WritingProvider;
}): Promise<ModelOption[]> {
  const key = requireKey(provider);
  try {
    return await listModels(provider, key);
  } catch (error) {
    throw providerError(error, key);
  }
}

export function saveDecisionModel(input: z.infer<typeof SaveDecisionInput>): AiSettingsDto {
  const saved = parseInput(SaveDecisionInput, input);
  requireKey(saved.provider);
  writeSetting('decision', saved);
  return getAiSettings();
}

/** The provider's decision models; doubles as a check of the key. */
export async function listDecisionModelsFor(
  input: z.infer<typeof ListDecisionModelsInput>,
): Promise<ModelOption[]> {
  const { provider } = parseInput(ListDecisionModelsInput, input);
  const key = requireKey(provider);
  try {
    return await listDecisionModels(provider, key);
  } catch (error) {
    throw providerError(error, key);
  }
}

/** The account's style guide, which every prompt gets; empty fields when it was never saved. */
export function getVoice(accountId: string): StyleGuide {
  const row = getDb()
    .select({ voice: xAccounts.voice })
    .from(xAccounts)
    .where(eq(xAccounts.id, accountId))
    .get();
  const parsed = VoiceInput.safeParse(row?.voice);
  return parsed.success ? parsed.data : EMPTY_STYLE;
}

export function saveVoice(accountId: string, voice: StyleGuide): StyleGuide {
  const saved = parseInput(VoiceInput, voice);
  getDb().update(xAccounts).set({ voice: saved }).where(eq(xAccounts.id, accountId)).run();
  return saved;
}

/** Rewrites a draft in the account's voice. Times out after a minute (generateText's limit). */
export async function refineDraft(accountId: string, text: string): Promise<string> {
  const config = writingConfig();
  if (!config) throw new InvalidStateError(AI_NOT_CONFIGURED);
  const draft = text.trim();
  let refined: string;
  try {
    const prompt = refinePostPrompt({ draft, style: getVoice(accountId), projects: [] });
    refined = cleanReply(await generateText(config, prompt), draft);
  } catch (error) {
    throw providerError(error, config.apiKey);
  }
  if (!refined) throw new Error('The model returned an empty reply. Try again.');
  return refined;
}
