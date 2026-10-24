// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toDateTimeInput } from '@xbase/core/posts/dates';
import { afterEach, expect, it, vi } from 'vitest';
import { ScheduleDialog } from '../ScheduleDialog';

afterEach(cleanup);

const HOUR = 3_600_000;

function setup(onConfirm: (date: Date) => Promise<void>, publishAt: string | null = null) {
  const user = userEvent.setup();
  render(<ScheduleDialog label="Schedule" publishAt={publishAt} onConfirm={onConfirm} />);
  return user;
}

const field = () => screen.getByLabelText<HTMLInputElement>(/Date and time/);
const pick = (value: string) => fireEvent.change(field(), { target: { value } });
// The trigger has the same name; React Aria makes the page behind the dialog inert.
const confirm = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Schedule' });

it('opens on the post’s time, in the browser’s zone, no earlier than allowed', async () => {
  const publishAt = new Date(Date.now() + 5 * HOUR);
  publishAt.setSeconds(0, 0);
  const user = setup(vi.fn(), publishAt.toISOString());
  await user.click(screen.getByRole('button', { name: 'Schedule' }));
  const dialog = screen.getByRole('dialog', { name: 'Schedule post' });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  expect(dialog.textContent).toContain(`Times are in your browser’s time zone, ${zone}.`);
  expect(field().value).toBe(toDateTimeInput(publishAt));
  expect(field().type).toBe('datetime-local');
  expect(field().min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  expect(field().getAttribute('aria-required')).toBe('true');
  // BoardUI's asterisk, like every other required field (hidden from screen readers).
  expect(field().labels?.[0]?.textContent).toBe('Date and time*');
  expect(confirm().getAttribute('aria-keyshortcuts')).toBe('Meta+Enter Control+Enter');
});

it('refuses a time that has passed, then confirms with ⌘↵ and gives focus back', async () => {
  const onConfirm = vi.fn(async (_date: Date) => {});
  const user = setup(onConfirm);
  const trigger = screen.getByRole('button', { name: 'Schedule' });
  await user.click(trigger);
  pick('2020-01-01T10:00');
  await user.click(field());
  await user.keyboard('{Meta>}{Enter}{/Meta}');
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain(
    'Pick a time at least a minute from now.',
  );
  expect(field().getAttribute('aria-invalid')).toBe('true');

  const tomorrow = toDateTimeInput(new Date(Date.now() + 24 * HOUR));
  pick(tomorrow);
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(toDateTimeInput(onConfirm.mock.calls[0][0])).toBe(tomorrow);
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

it('stays open while it works, and shows why it failed', async () => {
  let fail = (_error: Error) => {};
  const onConfirm = vi.fn(() => new Promise<void>((_resolve, reject) => (fail = reject)));
  const user = setup(onConfirm);
  await user.click(screen.getByRole('button', { name: 'Schedule' }));
  await user.click(confirm());
  expect(confirm().getAttribute('aria-busy')).toBe('true');
  // Busy: Escape, Cancel and another press do nothing.
  await user.keyboard('{Escape}');
  await user.click(confirm());
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fail(new Error('Write some text in every post'));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Not scheduled');
  expect(alert.textContent).toContain('Write some text in every post');
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});
