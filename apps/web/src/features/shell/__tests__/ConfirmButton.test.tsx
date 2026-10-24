// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmButton } from '../ConfirmButton';

afterEach(cleanup);

const setup = (onConfirm: () => Promise<void>) => {
  const user = userEvent.setup();
  render(
    <ConfirmButton
      size="small"
      title="Delete this post?"
      description="The draft is gone for good."
      action="Delete"
      errorTitle="Couldn’t delete"
      onConfirm={onConfirm}
    >
      Delete
    </ConfirmButton>,
  );
  return user;
};

// Focus lands on Cancel in browsers (autoFocus); happy-dom leaves it on the dialog itself.
it('asks in an alertdialog that Cancel and Escape close, giving focus back', async () => {
  const onConfirm = vi.fn(async () => {});
  const user = setup(onConfirm);
  const trigger = screen.getByRole('button', { name: 'Delete' });
  await user.click(trigger);
  const dialog = screen.getByRole('alertdialog', { name: 'Delete this post?' });
  const described = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
  expect(described?.textContent).toBe('The draft is gone for good.');
  expect(dialog.contains(document.activeElement)).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});

it('closes once the action succeeds, and runs it once', async () => {
  let finish = () => {};
  const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  const user = setup(onConfirm);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('alertdialog');
  const action = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!;
  await user.click(action);
  expect(action.getAttribute('aria-busy')).toBe('true');
  // Busy: a second press, Cancel and Escape do nothing.
  await user.click(action);
  await user.keyboard('{Escape}');
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
  finish();
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

it('stays open and shows the error when the action fails', async () => {
  const onConfirm = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('The server is restarting.'))
    .mockResolvedValueOnce();
  const user = setup(onConfirm);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('alertdialog');
  const action = () =>
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!;
  await user.click(action());
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Couldn’t delete');
  expect(alert.textContent).toContain('The server is restarting.');
  expect(screen.getByRole('alertdialog')).toBe(dialog);
  await user.click(action());
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  // Opening it again starts without the old error.
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
