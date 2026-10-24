// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CopyField } from '../CopyField';

afterEach(cleanup);

const URL = 'http://192.168.1.20:3000/mcp';

// After userEvent.setup(), which installs its own clipboard stub.
const setClipboard = (clipboard: Partial<Clipboard> | undefined) =>
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

const isSelected = (input: HTMLInputElement) =>
  document.activeElement === input &&
  input.selectionStart === 0 &&
  input.selectionEnd === input.value.length;

it('copies the value and says so', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn(async () => {});
  setClipboard({ writeText });
  render(<CopyField label="Server URL" value={URL} copyLabel="Copy server URL" />);
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Server URL' });
  expect(input.readOnly).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Copy server URL' }));
  expect(writeText).toHaveBeenCalledWith(URL);
  expect(screen.getByRole('status').textContent).toBe('Copied.');
});

it('selects the value instead when the browser has no clipboard (plain http)', async () => {
  const user = userEvent.setup();
  setClipboard(undefined);
  render(<CopyField label="Server URL" value={URL} copyLabel="Copy server URL" />);
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Server URL' });
  await user.click(screen.getByRole('button', { name: 'Copy server URL' }));
  expect(isSelected(input)).toBe(true);
  const status = screen.getByRole('status');
  expect(status.textContent).toContain('press Ctrl+C or ⌘C');
  // The note describes the field, so it's read with it.
  expect(input.getAttribute('aria-describedby')).toContain(status.id);
});

it('focuses and selects a value shown once', () => {
  render(
    <CopyField label="API key" value="xbase_ak_secret" copyLabel="Copy API key" selectOnMount />,
  );
  expect(isSelected(screen.getByRole<HTMLInputElement>('textbox', { name: 'API key' }))).toBe(true);
});
