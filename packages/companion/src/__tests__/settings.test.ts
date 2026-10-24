import { PROVIDERS } from '@xbase/ai/providers';
import { describe, expect, it } from 'vitest';
import { getStatus, type Settings, setProviderKey } from '../settings';

const model = PROVIDERS.openai.defaultModel;
const complete: Settings = {
  activeProvider: 'openai',
  providers: { openai: { apiKey: 'sk-test', model } },
  style: { persona: '', audience: '', voice: '', rules: '' },
  projects: [],
};

describe('getStatus', () => {
  it.each<[string, Settings, ReturnType<typeof getStatus>]>([
    [
      'no provider beats every other gap',
      { ...complete, activeProvider: null, providers: {} },
      { ready: false, reason: 'no-provider', provider: null },
    ],
    [
      'active provider without saved settings',
      { ...complete, providers: { anthropic: { apiKey: 'k', model } } },
      { ready: false, reason: 'no-key', provider: 'openai' },
    ],
    [
      'whitespace-only key',
      { ...complete, providers: { openai: { apiKey: '  ', model } } },
      { ready: false, reason: 'no-key', provider: 'openai' },
    ],
    ['key set, style guide optional', complete, { ready: true, provider: 'openai', model }],
  ])('%s', (_, settings, expected) => {
    expect(getStatus(settings)).toEqual(expected);
  });
});

describe('setProviderKey', () => {
  const custom = { id: 'gpt-x', label: 'GPT X', lowEffort: false };
  const base: Settings = {
    activeProvider: 'anthropic',
    providers: { openai: { apiKey: 'old', model: custom } },
    style: { persona: '', audience: '', voice: 's', rules: '' },
    projects: [],
  };

  it('picks the provider default model when none is saved, leaving the rest alone', () => {
    expect(setProviderKey(base, 'anthropic', 'sk-ant-1')).toEqual({
      ...base,
      providers: {
        ...base.providers,
        anthropic: { apiKey: 'sk-ant-1', model: PROVIDERS.anthropic.defaultModel },
      },
    });
  });

  it('keeps the saved model when replacing or removing a key', () => {
    expect(setProviderKey(base, 'openai', 'new').providers.openai).toEqual({
      apiKey: 'new',
      model: custom,
    });
    expect(setProviderKey(base, 'openai', '').providers.openai).toEqual({
      apiKey: '',
      model: custom,
    });
  });
});
