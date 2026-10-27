export const PROVIDER_IDS = ['openai', 'anthropic', 'xai', 'deepseek', 'openrouter'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ModelOption {
  id: string;
  label: string;
  /** Model accepts reasoning effort "low"; sent to keep replies fast and cheap. */
  lowEffort: boolean;
}

export interface ProviderInfo {
  label: string;
  /** How the provider's keys start. Undocumented, so it only ever triggers a warning. */
  keyPrefix: string;
  keysUrl: string;
  defaultModel: ModelOption;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    keyPrefix: 'sk-',
    keysUrl: 'https://platform.openai.com/api-keys',
    defaultModel: { id: 'gpt-6-luna', label: 'gpt-6-luna', lowEffort: true },
  },
  anthropic: {
    label: 'Anthropic',
    keyPrefix: 'sk-ant-',
    keysUrl: 'https://platform.claude.com/settings/keys',
    defaultModel: { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', lowEffort: true },
  },
  xai: {
    label: 'xAI (Grok)',
    keyPrefix: 'xai-',
    keysUrl: 'https://console.x.ai',
    defaultModel: { id: 'grok-4.3', label: 'grok-4.3', lowEffort: true },
  },
  deepseek: {
    label: 'DeepSeek',
    keyPrefix: 'sk-',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', lowEffort: true },
  },
  openrouter: {
    label: 'OpenRouter',
    keyPrefix: 'sk-or-',
    keysUrl: 'https://openrouter.ai/settings/keys',
    defaultModel: {
      id: 'anthropic/claude-haiku-5.5',
      label: 'Anthropic: Claude Haiku 5.5',
      lowEffort: true,
    },
  },
};

// Decision models answer typed questions (yes/no, choice, score) with probabilities instead of
// writing text. TypeSafe serves Jev directly; OpenAI's Decisions API has one fixed model;
// OpenRouter carries it and other makers' models through the same API.

export const DECISION_PROVIDER_IDS = ['typesafe', 'openai', 'openrouter'] as const;
export type DecisionProvider = (typeof DECISION_PROVIDER_IDS)[number];

export interface DecisionProviderInfo {
  label: string;
  defaultModel: ModelOption;
  /** The provider serves one fixed model, so there is nothing to choose. */
  fixedModel?: boolean;
}

/** The OpenRouter alias for Jev, which follows TypeSafe's newest release. */
const OPENROUTER_JEV_LATEST: ModelOption = {
  id: '~typesafe/jev-latest',
  label: 'TypeSafe: Jev Latest',
  lowEffort: false,
};

/** OpenRouter lists dozens of decision models; XBase offers this curated set, Jev first. */
export const OPENROUTER_DECISION_MODELS: ModelOption[] = [
  OPENROUTER_JEV_LATEST,
  { id: 'openai/gpt-6-luna-decisions', label: 'OpenAI: Decisions', lowEffort: false },
  { id: 'cloudflare/clef-flash', label: 'Cloudflare: Clef Flash', lowEffort: false },
  { id: 'perplexity/pplx-decider-v1.2', label: 'Perplexity: Decider V1.2', lowEffort: false },
  {
    id: 'microsoft/microsoft-decision-1',
    label: 'Microsoft: Microsoft-Decision-1',
    lowEffort: false,
  },
  { id: 'liquid/d1', label: 'LiquidAI: d1', lowEffort: false },
  { id: 'inception/mercury-decide', label: 'Inception: Mercury Decide', lowEffort: false },
  { id: 'upstage/solar-decide', label: 'Upstage: Solar Decide', lowEffort: false },
];

export const DECISION_PROVIDERS: Record<DecisionProvider, DecisionProviderInfo> = {
  typesafe: {
    label: 'TypeSafe',
    // The alias follows the newest stable Jev; a numbered version stays put.
    defaultModel: { id: 'jev-latest', label: 'jev-latest', lowEffort: false },
  },
  openai: {
    label: 'OpenAI',
    // The Decisions API's fixed wire model. XBase only uses it through POST /v1/decisions,
    // never OpenAI's chat model of the same name, and there is no list to choose from.
    defaultModel: { id: 'gpt-6-luna', label: 'Decisions API', lowEffort: false },
    fixedModel: true,
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: OPENROUTER_JEV_LATEST,
  },
};

/** Warn-only check. A longer matching prefix is another provider's: sk-ant- isn't an OpenAI sk- key. */
export function looksLikeKeyFor(provider: ProviderId, key: string): boolean {
  const own = PROVIDERS[provider].keyPrefix;
  return (
    key.startsWith(own) &&
    !PROVIDER_IDS.some((id) => {
      const other = PROVIDERS[id].keyPrefix;
      return other.length > own.length && key.startsWith(other);
    })
  );
}
