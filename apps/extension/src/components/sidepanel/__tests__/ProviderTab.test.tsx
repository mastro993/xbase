// @vitest-environment happy-dom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listModels } from '@xbase/ai/llm';
import { PROVIDERS } from '@xbase/ai/providers';
import { DEFAULT_SETTINGS, type Settings } from '@xbase/companion/settings';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { getSettings, saveSettings } from '@/lib/settings';
import { ProviderTab } from '../ProviderTab';

vi.mock('@xbase/ai/llm', () => ({ listModels: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('reloads models when the stored key changes elsewhere', async () => {
  const model = PROVIDERS.openai.defaultModel;
  vi.mocked(listModels).mockResolvedValue([model]);
  const withKey = (apiKey: string): Settings => ({
    activeProvider: 'openai',
    providers: { openai: { apiKey, model } },
    style: { persona: '', audience: '', voice: '', rules: '' },
    projects: [],
  });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const render = (s: Settings) => act(async () => root.render(<ProviderTab settings={s} />));

  await render(withKey('sk-a'));
  expect(container.textContent).toContain('Key verified · 1 model');

  await render(withKey('')); // e.g. removed in another tab's panel
  expect(container.textContent).not.toContain('Key verified');

  await render(withKey('sk-b'));
  expect(vi.mocked(listModels).mock.calls).toEqual([
    ['openai', 'sk-a'],
    ['openai', 'sk-b'],
  ]);
  await act(async () => root.unmount());
});

it('switches the active provider from the select', async () => {
  await saveSettings(DEFAULT_SETTINGS);
  const user = userEvent.setup();
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => root.render(<ProviderTab settings={DEFAULT_SETTINGS} />));

  const trigger = within(container).getByRole('button', { name: /Active provider/ });
  expect(trigger.textContent).toContain('Choose a provider');
  await user.click(trigger);
  // The list opens in a popover outside the container.
  await user.click(screen.getByRole('option', { name: 'Anthropic' }));
  expect((await getSettings()).activeProvider).toBe('anthropic');
  await act(async () => root.unmount());
});
