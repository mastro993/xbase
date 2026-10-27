// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ModelOption, PROVIDERS } from '@xbase/ai/providers';
import type { AiSettingsDto } from '@xbase/core/ai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AiProviderCard } from '../AiProviderCard';

const mocks = vi.hoisted(() => ({
  listModelsFn: vi.fn(),
  saveAiSettingsFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server functions' module needs the server; the card only calls them.
vi.mock('../ai.functions', () => ({
  listModelsFn: mocks.listModelsFn,
  saveAiSettingsFn: mocks.saveAiSettingsFn,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));

const model = (id: string, label = id): ModelOption => ({ id, label, lowEffort: true });
const OPENROUTER = Array.from({ length: 300 }, (_, i) => model(`vendor/model-${i}`, `Model ${i}`));
const SETTINGS: AiSettingsDto = {
  available: ['openai', 'openrouter'],
  writing: {
    provider: 'openrouter',
    model: model('anthropic/claude-haiku-5.5', 'Anthropic: Claude Haiku 5.5'),
  },
  decisionProviders: [],
  decision: null,
};

beforeEach(() => {
  mocks.listModelsFn.mockReset();
  mocks.saveAiSettingsFn.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

const modelInput = () => screen.getByRole('combobox', { name: 'Model' }) as HTMLInputElement;

it('says which variables to set while no provider has a key', () => {
  render(
    <AiProviderCard
      settings={{ available: [], writing: null, decisionProviders: [], decision: null }}
    />,
  );
  expect(screen.getByRole('note').textContent).toContain(
    'Set OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY or OPENROUTER_API_KEY',
  );
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});

it('offers only the providers with a key, never asking for one', async () => {
  const user = userEvent.setup();
  render(<AiProviderCard settings={SETTINGS} />);
  expect(screen.queryByLabelText(/API key/)).toBeNull();
  expect(
    screen.getByText(/To offer Anthropic or xAI \(Grok\), set ANTHROPIC_API_KEY or XAI_API_KEY/),
  ).toBeDefined();
  await user.click(screen.getByRole('button', { name: /Provider/ }));
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    'OpenAI',
    'OpenRouter',
  ]);
});

it('saves the current choice without asking the provider', async () => {
  const user = userEvent.setup();
  mocks.saveAiSettingsFn.mockResolvedValue(SETTINGS);
  render(<AiProviderCard settings={SETTINGS} />);
  const save = screen.getByRole('button', { name: 'Save' });
  await user.click(save);
  expect(mocks.listModelsFn).not.toHaveBeenCalled();
  expect(mocks.saveAiSettingsFn).toHaveBeenCalledWith({
    data: { provider: 'openrouter', model: SETTINGS.writing?.model },
  });
  expect(mocks.invalidate).toHaveBeenCalled();
  expect(screen.getAllByRole('status').some((s) => s.textContent === 'Saved')).toBe(true);
  expect(document.activeElement).toBe(save);
});

it('switches to another provider’s default model', async () => {
  const user = userEvent.setup();
  mocks.saveAiSettingsFn.mockResolvedValue(SETTINGS);
  render(<AiProviderCard settings={SETTINGS} />);
  await user.click(screen.getByRole('button', { name: /Provider/ }));
  await user.click(screen.getByRole('option', { name: 'OpenAI' }));
  expect(modelInput().value).toBe(PROVIDERS.openai.defaultModel.label);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.saveAiSettingsFn).toHaveBeenCalledWith({
    data: { provider: 'openai', model: PROVIDERS.openai.defaultModel },
  });
});

it('reports models it couldn’t load, and saves nothing', async () => {
  const user = userEvent.setup();
  mocks.listModelsFn.mockRejectedValue(new Error('Invalid API key'));
  render(<AiProviderCard settings={SETTINGS} />);
  await user.click(screen.getByRole('button', { name: 'Load models' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Couldn’t load models');
  expect(alert.textContent).toContain('Invalid API key');
  expect(mocks.saveAiSettingsFn).not.toHaveBeenCalled();
});

it('searches a long model list and picks from it', async () => {
  const user = userEvent.setup();
  mocks.listModelsFn.mockResolvedValue(OPENROUTER);
  render(<AiProviderCard settings={SETTINGS} />);
  const load = screen.getByRole('button', { name: 'Load models' });
  await user.click(load);
  expect(mocks.listModelsFn).toHaveBeenCalledWith({ data: { provider: 'openrouter' } });
  expect(document.activeElement).toBe(load);
  const input = modelInput();
  expect(input.value).toBe('Anthropic: Claude Haiku 5.5');
  await user.clear(input);
  await user.type(input, 'Model 29');
  const listbox = screen.getByRole('listbox');
  // Model 29 and Model 290…299.
  expect(within(listbox).getAllByRole('option')).toHaveLength(11);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(input.value).toBe('Model 29');
  mocks.saveAiSettingsFn.mockResolvedValue(SETTINGS);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.saveAiSettingsFn).toHaveBeenCalledWith({
    data: { provider: 'openrouter', model: model('vendor/model-29', 'Model 29') },
  });
});
