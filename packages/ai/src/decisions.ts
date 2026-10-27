// The models that decide, per provider: TypeSafe's Jev, OpenAI's Decisions API and OpenRouter's
// curated decision catalog. They all answer typed questions with probabilities instead of text.

import { fetchJson } from './http';
import {
  DECISION_PROVIDERS,
  OPENROUTER_DECISION_MODELS,
  type DecisionProvider,
  type ModelOption,
} from './providers';
import { listTypeSafeModels } from './typesafe';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const TIMEOUT = 'Loading models timed out. Try again.';

/** OpenRouter's curated decision list; /key is what checks the key. */
async function listOpenRouterModels(apiKey: string): Promise<ModelOption[]> {
  await fetchJson(
    `${OPENROUTER_BASE}/key`,
    { headers: { authorization: `Bearer ${apiKey}` } },
    TIMEOUT,
  );
  return OPENROUTER_DECISION_MODELS;
}

/** The provider's decision models. Throws Error('Invalid API key') on a 401. */
export function listDecisionModels(
  provider: DecisionProvider,
  apiKey: string,
): Promise<ModelOption[]> {
  switch (provider) {
    case 'typesafe':
      return listTypeSafeModels(apiKey);
    case 'openai':
      // The Decisions API has one fixed model and no catalog: XBase never calls OpenAI's
      // general model listing, so there is no Luna to pick here.
      return Promise.resolve([DECISION_PROVIDERS.openai.defaultModel]);
    case 'openrouter':
      return listOpenRouterModels(apiKey);
  }
}
