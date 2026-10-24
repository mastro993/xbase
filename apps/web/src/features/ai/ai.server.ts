import { scrubSecrets } from '@xbase/ai/errors';
import { generateText, type LlmConfig, listModels } from '@xbase/ai/llm';
import { EMPTY_STYLE, type StyleGuide } from '@xbase/ai/profile';
import { cleanReply, refinePostPrompt } from '@xbase/ai/prompts';
import { type ModelOption, PROVIDERS, type ProviderId } from '@xbase/ai/providers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { InvalidStateError, ValidationError } from '@/lib/errors';
import { parseInput } from '@/lib/validate';
import { getDb } from '@/server/db/client.server';
import { settings } from '@/server/db/schema';
import {
  AI_NOT_CONFIGURED,
  type AiSettingsDto,
  SaveAiSettingsInput,
  VoiceInput,
} from './ai.schema';

// AI writing with the owner's own provider key. The key is stored in SQLite and only ever used
// here: it never goes back to the browser, and errors are scrubbed of it.

const StoredAi = SaveAiSettingsInput.extend({ apiKey: z.string().min(1) });

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

const storedAi = (): LlmConfig | null => readSetting('ai', StoredAi);

function toDto(config: LlmConfig | null): AiSettingsDto {
  if (!config) return null;
  return { provider: config.provider, model: config.model, keyHint: `…${config.apiKey.slice(-4)}` };
}

// Provider error text can echo the key back: it reaches the browser scrubbed.
const MAX_ERROR = 300;
function providerError(error: unknown, apiKey: string): Error {
  const message = error instanceof Error ? error.message : 'The AI provider request failed.';
  return new Error(scrubSecrets(message, apiKey, MAX_ERROR));
}

export function getAiSettings(): AiSettingsDto {
  return toDto(storedAi());
}

/** Without apiKey, keeps the stored key if it's for the same provider. */
export function saveAiSettings(input: {
  provider: ProviderId;
  model: ModelOption;
  apiKey?: string;
}): AiSettingsDto {
  const stored = storedAi();
  const apiKey = input.apiKey ?? (stored?.provider === input.provider ? stored.apiKey : undefined);
  if (!apiKey) throw new ValidationError(`Enter your ${PROVIDERS[input.provider].label} API key.`);
  const config = { provider: input.provider, model: input.model, apiKey };
  writeSetting('ai', config);
  return toDto(config);
}

/** The provider's text models; doubles as a key check. Without apiKey, uses the stored one. */
export async function listModelsFor({
  provider,
  apiKey,
}: {
  provider: ProviderId;
  apiKey?: string;
}): Promise<ModelOption[]> {
  const stored = storedAi();
  const key = apiKey ?? (stored?.provider === provider ? stored.apiKey : undefined);
  if (!key) throw new ValidationError(`Enter your ${PROVIDERS[provider].label} API key.`);
  try {
    return await listModels(provider, key);
  } catch (error) {
    throw providerError(error, key);
  }
}

/** The style guide every prompt gets; empty fields when it was never saved. */
export function getVoice(): StyleGuide {
  return readSetting('voice', VoiceInput) ?? EMPTY_STYLE;
}

export function saveVoice(voice: StyleGuide): StyleGuide {
  const saved = parseInput(VoiceInput, voice);
  writeSetting('voice', saved);
  return saved;
}

/** Rewrites a draft in the owner's voice. Times out after a minute (generateText's limit). */
export async function refineDraft(text: string): Promise<string> {
  const config = storedAi();
  if (!config) throw new InvalidStateError(AI_NOT_CONFIGURED);
  const draft = text.trim();
  let refined: string;
  try {
    const prompt = refinePostPrompt({ draft, style: getVoice(), projects: [] });
    refined = cleanReply(await generateText(config, prompt), draft);
  } catch (error) {
    throw providerError(error, config.apiKey);
  }
  if (!refined) throw new Error('The model returned an empty reply. Try again.');
  return refined;
}
