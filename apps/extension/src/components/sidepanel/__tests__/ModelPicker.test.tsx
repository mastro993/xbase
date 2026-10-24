// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModelOption } from '@xbase/ai/providers';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelPicker } from '../ModelPicker';

afterEach(cleanup);

const MODELS: ModelOption[] = Array.from({ length: 60 }, (_, i) => ({
  id: `vendor/m${i}`,
  label: `Model ${i}`,
  lowEffort: false,
}));

function setup(props: Partial<ComponentProps<typeof ModelPicker>> = {}) {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onRefresh = vi.fn();
  const all = {
    hasKey: true,
    value: MODELS[0]!,
    models: MODELS,
    loading: false,
    onChange,
    onRefresh,
    ...props,
  };
  const { rerender } = render(<ModelPicker {...all} />);
  return {
    user,
    onChange,
    onRefresh,
    rerender: (more: Partial<ComponentProps<typeof ModelPicker>>) =>
      rerender(<ModelPicker {...all} {...more} />),
    input: () => screen.getByRole<HTMLInputElement>('combobox', { name: 'Model' }),
    open: () => user.click(screen.getByRole('button', { name: /show suggestions/i })),
    options: () => screen.queryAllByRole('option').map((o) => o.textContent),
  };
}

it('shows the selected model and lists 50 models at most, saying so', async () => {
  const { input, open, options } = setup({ value: MODELS[55]! });
  expect(input().value).toBe('Model 55');
  await open();
  // Selected first, even past the limit.
  expect(options()).toHaveLength(50);
  expect(options().slice(0, 2)).toEqual(['Model 55', 'Model 0']);
  expect(screen.getByText('Showing 50 of 60. Type to search.')).toBeTruthy();
});

it('searches labels and IDs, and picks with the keyboard', async () => {
  const { user, input, options, onChange } = setup();
  await user.clear(input());
  await user.type(input(), 'VENDOR/M1');
  expect(options()).toEqual(['Model 1', ...Array.from({ length: 10 }, (_, i) => `Model 1${i}`)]);
  expect(screen.queryByText(/^Showing/)).toBeNull();
  await user.type(input(), '2');
  expect(options()).toEqual(['Model 12']);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenLastCalledWith(MODELS[12]);
});

it('shows the selected model again when you leave without picking', async () => {
  const { user, input, open, options, onChange } = setup();
  await user.clear(input());
  await user.type(input(), 'Model 3');
  await user.tab();
  expect(input().value).toBe('Model 0');
  expect(onChange).not.toHaveBeenCalled();
  await open();
  expect(options()).toHaveLength(50);
});

it('says when nothing matches', async () => {
  const { user, input, options } = setup();
  await user.clear(input());
  await user.type(input(), 'zzz');
  expect(options()).toEqual(['No models found']);
});

it('keeps the saved model selectable before the list loads, and says it is loading', async () => {
  const saved = { id: 'old', label: 'Old model', lowEffort: false };
  const { input, open, options, rerender } = setup({ value: saved, models: null, loading: true });
  expect(input().value).toBe('Old model');
  await open();
  expect(options()).toEqual(['Old model']);
  expect(screen.getByText('Loading models…')).toBeTruthy();
  rerender({ value: null });
  expect(options()).toEqual(['Loading models…']);
});

it('is disabled without a key, refresh included', async () => {
  const { user, input, onRefresh } = setup({ hasKey: false });
  expect(input().disabled).toBe(true);
  expect(input().value).toBe('');
  expect(input().placeholder).toBe('Add a key to load models');
  const refresh = screen.getByRole('button', { name: 'Refresh models' });
  expect(refresh.getAttribute('aria-disabled')).toBe('true');
  await user.click(refresh);
  expect(onRefresh).not.toHaveBeenCalled();
});

it('keeps focus on refresh while the list reloads', async () => {
  const { user, onRefresh, rerender } = setup();
  const refresh = screen.getByRole('button', { name: 'Refresh models' });
  await user.click(refresh);
  expect(onRefresh).toHaveBeenCalledOnce();
  rerender({ loading: true });
  expect(document.activeElement).toBe(refresh);
  expect(refresh.getAttribute('aria-disabled')).toBe('true');
  await user.click(refresh);
  expect(onRefresh).toHaveBeenCalledOnce();
});
