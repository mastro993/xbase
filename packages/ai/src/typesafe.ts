// Apps type check this source with their own lib setting: bring Array#toSorted along.
/// <reference lib="es2023.array" />
import { fetchJson } from './http';
import type { ModelOption } from './providers';

// TypeSafe's System One models (Jev): they answer typed questions (yes/no, score, choice) with
// probabilities instead of writing text, so they make decisions rather than refine drafts.

const BASE = 'https://api.typesafe.ai/v1';

/** The models and aliases the key can use, sorted. Throws Error('Invalid API key') on a 401. */
export async function listTypeSafeModels(apiKey: string): Promise<ModelOption[]> {
  const { models } = await fetchJson<{ models?: { name: string }[] }>(
    `${BASE}/models`,
    { headers: { authorization: `Bearer ${apiKey}` } },
    'Loading models timed out. Try again.',
  );
  return (models ?? [])
    .map(({ name }) => ({ id: name, label: name, lowEffort: false }))
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
