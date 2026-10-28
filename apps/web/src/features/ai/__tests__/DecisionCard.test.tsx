// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DECISION_PROVIDERS, type ModelOption } from '@xbase/ai/providers';
import type { AiSettingsDto } from '@xbase/core/ai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DecisionCard } from '../DecisionCard';

const mocks = vi.hoisted(() => ({
  listDecisionModelsFn: vi.fn(),
  saveDecisionFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server functions' module needs the server; the card only calls them.
vi.mock('../ai.functions', () => ({
  listDecisionModelsFn: mocks.listDecisionModelsFn,
  saveDecisionFn: mocks.saveDecisionFn,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));

const MODEL = (id: string, label = id): ModelOption => ({ id, label, lowEffort: false });

const SETTINGS: AiSettingsDto = {
  available: ['openrouter'],
  writing: null,
  decisionProviders: ['typesafe', 'openrouter'],
  decision: { provider: 'openrouter', model: DECISION_PROVIDERS.openrouter.defaultModel },
};

beforeEach(() => {
  mocks.listDecisionModelsFn.mockReset();
  mocks.saveDecisionFn.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

const modelInput = () => screen.getByRole('combobox', { name: 'Model' }) as HTMLInputElement;

it('says which variables to set while no decision provider has a key', () => {
  render(
    <DecisionCard
      settings={{ available: [], writing: null, decisionProviders: [], decision: null }}
    />,
  );
  expect(screen.getByRole('note').textContent).toContain(
    'Set TYPESAFE_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY',
  );
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});

it('offers only the decision providers with a key, and saves the choice', async () => {
  const user = userEvent.setup();
  mocks.saveDecisionFn.mockResolvedValue(SETTINGS);
  render(<DecisionCard settings={SETTINGS} />);

  expect(screen.getByText(/To offer OpenAI, set OPENAI_API_KEY/)).toBeDefined();
  await user.click(screen.getByRole('button', { name: /Provider/ }));
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    'TypeSafe',
    'OpenRouter',
  ]);

  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.saveDecisionFn).toHaveBeenCalledWith({
    data: { provider: 'openrouter', model: DECISION_PROVIDERS.openrouter.defaultModel },
  });
  expect(mocks.invalidate).toHaveBeenCalled();
  expect(screen.getAllByRole('status').some((s) => s.textContent === 'Saved')).toBe(true);
});

it('switches to the other provider’s default model', async () => {
  const user = userEvent.setup();
  mocks.saveDecisionFn.mockResolvedValue(SETTINGS);
  render(<DecisionCard settings={SETTINGS} />);

  await user.click(screen.getByRole('button', { name: /Provider/ }));
  await user.click(screen.getByRole('option', { name: 'TypeSafe' }));
  expect(modelInput().value).toBe('jev-latest');

  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.saveDecisionFn).toHaveBeenCalledWith({
    data: { provider: 'typesafe', model: DECISION_PROVIDERS.typesafe.defaultModel },
  });
});

it('shows OpenAI’s Decisions API as one fixed model with nothing to load', async () => {
  const user = userEvent.setup();
  const settings: AiSettingsDto = {
    ...SETTINGS,
    decisionProviders: ['typesafe', 'openai'],
    decision: { provider: 'typesafe', model: DECISION_PROVIDERS.typesafe.defaultModel },
  };
  mocks.saveDecisionFn.mockResolvedValue(settings);
  render(<DecisionCard settings={settings} />);

  await user.click(screen.getByRole('button', { name: /Provider/ }));
  await user.click(screen.getByRole('option', { name: 'OpenAI' }));

  const field = screen.getByRole('textbox', { name: 'Model' }) as HTMLInputElement;
  expect(field.value).toBe('Decisions API');
  expect(field.readOnly).toBe(true);
  expect(screen.queryByRole('button', { name: 'Load models' })).toBeNull();
  expect(screen.getAllByText(/Decisions API/).length).toBeGreaterThan(0);

  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.saveDecisionFn).toHaveBeenCalledWith({
    data: { provider: 'openai', model: DECISION_PROVIDERS.openai.defaultModel },
  });
});

it('loads the chosen provider’s models and reports failures', async () => {
  const user = userEvent.setup();
  mocks.listDecisionModelsFn.mockResolvedValue([MODEL('jev-2'), MODEL('jev-latest')]);
  render(<DecisionCard settings={SETTINGS} />);

  await user.click(screen.getByRole('button', { name: 'Load models' }));
  expect(mocks.listDecisionModelsFn).toHaveBeenCalledWith({ data: { provider: 'openrouter' } });
  expect(
    screen
      .getAllByRole('status')
      .map((s) => s.textContent)
      .join(' '),
  ).toContain('2 models');

  mocks.listDecisionModelsFn.mockRejectedValue(new Error('Invalid API key'));
  await user.click(screen.getByRole('button', { name: 'Load models' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Couldn’t load models');
  expect(alert.textContent).toContain('Invalid API key');
});
