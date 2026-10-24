// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NewApiKeyDialog } from '../NewApiKeyDialog';

const mocks = vi.hoisted(() => ({ createApiKeyFn: vi.fn(), invalidate: vi.fn(async () => {}) }));

// The server function's module needs the server; the dialog only calls it.
vi.mock('../api-keys.functions', () => ({ createApiKeyFn: mocks.createApiKeyFn }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));

const KEY = 'xbase_ak_0123456789abcdef0123456789abcdef0123456789ab';

beforeEach(() => {
  mocks.createApiKeyFn.mockReset();
  mocks.createApiKeyFn.mockResolvedValue({ key: KEY, apiKey: { name: 'Backup script' } });
});
afterEach(cleanup);

const open = async () => {
  const user = userEvent.setup();
  render(<NewApiKeyDialog />);
  const trigger = screen.getByRole('button', { name: 'New API key' });
  await user.click(trigger);
  return { user, trigger };
};

// The name field's autoFocus works in browsers; happy-dom leaves focus on the dialog itself.
it('refuses an empty name without calling the server, and focuses the field', async () => {
  const { user } = await open();
  const name = screen.getByRole('textbox', { name: /Name/ });
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('Name the key');
  expect(name.getAttribute('aria-invalid')).toBe('true');
  expect(name.getAttribute('aria-describedby')).toContain(alert.id);
  expect(document.activeElement).toBe(name);
  expect(mocks.createApiKeyFn).not.toHaveBeenCalled();
});

it('shows the new key once, selected, and keeps it on screen until Done', async () => {
  const { user, trigger } = await open();
  await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Backup script{Enter}');
  expect(mocks.createApiKeyFn).toHaveBeenCalledWith({ data: { name: 'Backup script' } });
  expect(mocks.invalidate).toHaveBeenCalled();
  const dialog = await screen.findByRole('dialog', { name: 'Your key for Backup script' });
  const key = screen.getByRole<HTMLInputElement>('textbox', { name: 'API key' });
  expect(key.value).toBe(KEY);
  await vi.waitFor(() => expect(document.activeElement).toBe(key));
  expect(key.selectionEnd).toBe(KEY.length);
  // A stray press outside doesn't lose it.
  await user.click(document.body);
  expect(screen.getByRole('dialog')).toBe(dialog);
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  // The next opening starts over, without the key.
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'New API key' })).toBeTruthy();
  expect(screen.queryByDisplayValue(KEY)).toBeNull();
});

it('keeps the dialog open with the server’s error', async () => {
  mocks.createApiKeyFn.mockRejectedValueOnce(new Error('The server is restarting.'));
  const { user } = await open();
  await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Script');
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Couldn’t create the key');
  expect(alert.textContent).toContain('The server is restarting.');
  expect(screen.getByRole('dialog', { name: 'New API key' })).toBeTruthy();
});
