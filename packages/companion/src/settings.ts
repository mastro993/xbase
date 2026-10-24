import { EMPTY_STYLE, type Project, type StyleGuide } from '@xbase/ai/profile';
import { type ModelOption, PROVIDER_IDS, PROVIDERS, type ProviderId } from '@xbase/ai/providers';

// The extension's settings and what they allow. The extension stores them in chrome.storage
// (apps/extension/src/lib/settings.ts), with the API keys in an item of their own.

export interface ProviderSettings {
  apiKey: string;
  model: ModelOption;
}

/** What the app works with. Storage keeps the API keys apart, see splitSettings. */
export interface Settings {
  activeProvider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  style: StyleGuide;
  projects: Project[];
}

/** Settings without their API keys, as storage keeps them. */
export type StoredSettings = Omit<Settings, 'providers'> & {
  providers: Partial<Record<ProviderId, { model: ModelOption }>>;
};
export type ApiKeys = Partial<Record<ProviderId, string>>;

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: null,
  providers: {},
  style: EMPTY_STYLE,
  projects: [],
};

/** Takes the API keys out of `settings`, so each half can be stored on its own. */
export function splitSettings({ providers, ...rest }: Settings): [StoredSettings, ApiKeys] {
  const models: StoredSettings['providers'] = {};
  const keys: ApiKeys = {};
  for (const id of PROVIDER_IDS) {
    const p = providers[id];
    if (!p) continue;
    models[id] = { model: p.model };
    if (p.apiKey) keys[id] = p.apiKey;
  }
  return [{ ...rest, providers: models }, keys];
}

/** splitSettings' inverse. A key without a model gets the provider's default. */
export function mergeSettings(stored: StoredSettings, keys: ApiKeys): Settings {
  const providers: Settings['providers'] = {};
  for (const id of PROVIDER_IDS) {
    const model = stored.providers[id]?.model;
    const apiKey = keys[id];
    if (model || apiKey) {
      providers[id] = { apiKey: apiKey ?? '', model: model ?? PROVIDERS[id].defaultModel };
    }
  }
  return { ...stored, providers };
}

export type Status =
  | { ready: true; provider: ProviderId; model: ModelOption }
  | { ready: false; reason: 'no-provider' | 'no-key'; provider: ProviderId | null };

/** Pure. Order of checks: provider, key (trimmed). Every saved key has a model. */
export function getStatus(s: Settings): Status {
  const provider = s.activeProvider;
  if (!provider) return { ready: false, reason: 'no-provider', provider: null };
  const p = s.providers[provider];
  if (!p?.apiKey.trim()) return { ready: false, reason: 'no-key', provider };
  return { ready: true, provider, model: p.model };
}

/** Stores a key for `provider`, keeping its model or falling back to the provider default. */
export function setProviderKey(s: Settings, provider: ProviderId, apiKey: string): Settings {
  const model = s.providers[provider]?.model ?? PROVIDERS[provider].defaultModel;
  return { ...s, providers: { ...s.providers, [provider]: { apiKey, model } } };
}
