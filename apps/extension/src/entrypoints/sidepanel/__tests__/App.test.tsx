// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, saveSettings } from '@/lib/settings';
import App from '../App';

vi.mock('@xbase/ai/llm', () => ({ listModels: vi.fn() }));
afterEach(cleanup);

it('keeps an open key form across tab switches, inert while another tab shows', async () => {
  await saveSettings(DEFAULT_SETTINGS);
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Add OpenAI key' }));
  const input = screen.getByLabelText<HTMLInputElement>('OpenAI API key');
  await user.type(input, 'sk-draft');
  const provider = screen.getByRole('tabpanel');

  await user.click(screen.getByRole('tab', { name: 'Style' }));
  expect(screen.getByRole('tabpanel', { name: 'Style' })).toBeTruthy();
  expect(provider.hasAttribute('data-inert')).toBe(true);
  expect(provider.contains(input)).toBe(true);

  await user.click(screen.getByRole('tab', { name: 'Provider' }));
  expect(provider.hasAttribute('data-inert')).toBe(false);
  expect(input.value).toBe('sk-draft');
});
