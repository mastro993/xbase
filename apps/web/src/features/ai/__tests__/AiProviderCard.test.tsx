// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModelOption } from '@xbase/ai/providers';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AiSettingsDto } from '../ai.schema';
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
const STORED: AiSettingsDto = {
  provider: 'openrouter',
  model: model('anthropic/claude-haiku-5.5', 'Anthropic: Claude Haiku 5.5'),
  keyHint: '…1234',
};

beforeEach(() => {
  mocks.listModelsFn.mockReset();
  mocks.saveAiSettingsFn.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

const keyField = () => screen.getByLabelText('API key');

const chooseOpenAi = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Provider/ }));
  await user.click(screen.getByRole('option', { name: 'OpenAI' }));
};

it('asks for a key before saving, and focuses its field', async () => {
  const user = userEvent.setup();
  render(<AiProviderCard settings={null} />);
  expect(screen.queryByLabelText('API key')).toBeNull();
  await chooseOpenAi(user);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert').textContent).toContain('Enter your OpenAI API key.');
  expect(document.activeElement).toBe(keyField());
  expect(mocks.listModelsFn).not.toHaveBeenCalled();
});

it('keeps the key write-only and warns about another provider’s key', async () => {
  const user = userEvent.setup();
  render(<AiProviderCard settings={null} />);
  await chooseOpenAi(user);
  const key = keyField();
  expect(key.getAttribute('type')).toBe('password');
  expect(key.getAttribute('autocomplete')).toBe('off');
  expect(key.hasAttribute('data-1p-ignore')).toBe(true);
  expect(key.getAttribute('data-lpignore')).toBe('true');
  await user.type(key, 'xai-abc');
  const help = document.getElementById(key.getAttribute('aria-describedby')!.split(' ')[0]);
  expect(help?.textContent).toContain('doesn’t look like an API key for OpenAI');
});

it('marks a refused key and saves nothing', async () => {
  const user = userEvent.setup();
  mocks.listModelsFn.mockRejectedValue(new Error('Invalid API key'));
  render(<AiProviderCard settings={null} />);
  await chooseOpenAi(user);
  await user.type(keyField(), 'sk-fake');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Not saved');
  expect(alert.textContent).toContain('Invalid API key');
  expect(keyField().getAttribute('aria-invalid')).toBe('true');
  expect(keyField().getAttribute('aria-describedby')).toContain(alert.id);
  expect(mocks.saveAiSettingsFn).not.toHaveBeenCalled();
  expect((keyField() as HTMLInputElement).value).toBe('sk-fake');
});

it('saves with the stored key without asking the provider', async () => {
  const user = userEvent.setup();
  mocks.saveAiSettingsFn.mockResolvedValue(undefined);
  render(<AiProviderCard settings={STORED} />);
  expect(keyField().getAttribute('placeholder')).toBe('Leave empty to keep …1234');
  const save = screen.getByRole('button', { name: 'Save' });
  await user.click(save);
  expect(mocks.listModelsFn).not.toHaveBeenCalled();
  expect(mocks.saveAiSettingsFn).toHaveBeenCalledWith({
    data: { provider: 'openrouter', model: STORED.model, apiKey: undefined },
  });
  expect(mocks.invalidate).toHaveBeenCalled();
  expect(screen.getAllByRole('status').some((s) => s.textContent === 'Saved')).toBe(true);
  expect(document.activeElement).toBe(save);
});

it('searches a long model list and picks from it', async () => {
  const user = userEvent.setup();
  mocks.listModelsFn.mockResolvedValue(OPENROUTER);
  render(<AiProviderCard settings={STORED} />);
  const load = screen.getByRole('button', { name: 'Load models' });
  await user.click(load);
  expect(mocks.listModelsFn).toHaveBeenCalledWith({
    data: { provider: 'openrouter', apiKey: undefined },
  });
  expect(document.activeElement).toBe(load);
  const input = screen.getByRole('combobox', { name: 'Model' });
  expect((input as HTMLInputElement).value).toBe('Anthropic: Claude Haiku 5.5');
  await user.clear(input);
  await user.type(input, 'Model 29');
  const listbox = screen.getByRole('listbox');
  // Model 29 and Model 290…299.
  expect(within(listbox).getAllByRole('option')).toHaveLength(11);
  await user.keyboard('{ArrowDown}{Enter}');
  expect((input as HTMLInputElement).value).toBe('Model 29');
  mocks.saveAiSettingsFn.mockResolvedValue(undefined);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.saveAiSettingsFn).toHaveBeenCalledWith({
    data: {
      provider: 'openrouter',
      model: model('vendor/model-29', 'Model 29'),
      apiKey: undefined,
    },
  });
});
