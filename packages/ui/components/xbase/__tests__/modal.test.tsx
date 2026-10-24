import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { Modal, type ModalProps } from '../modal';

function Harness(props: Partial<ModalProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        title="Schedule post"
        description="Pick a time"
        footer={<Button onClick={() => setOpen(false)}>Done</Button>}
        {...props}
      >
        <input aria-label="When" />
      </Modal>
    </>
  );
}

const open = async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return user;
};

it('is named by its title, described, and takes focus', async () => {
  await open();
  const dialog = screen.getByRole('dialog', { name: 'Schedule post' });
  const described = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
  expect(described?.textContent).toBe('Pick a time');
  expect(dialog.contains(document.activeElement)).toBe(true);
});

it('keeps Tab inside and gives focus back to the trigger on Escape', async () => {
  const user = await open();
  const dialog = screen.getByRole('dialog');
  // Past the last control (When, Close, Done) and back.
  await user.keyboard('{Tab}{Tab}{Tab}{Tab}');
  expect(dialog.contains(document.activeElement)).toBe(true);
  await user.keyboard('{Shift>}{Tab}{Tab}{Tab}{Tab}{/Shift}');
  expect(dialog.contains(document.activeElement)).toBe(true);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
});

it('closes from its close button and its footer', async () => {
  const user = await open();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes on a press outside by default', async () => {
  const user = await open();
  await user.click(document.body);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('as an alertdialog, ignores a press outside but still closes on Escape', async () => {
  const user = userEvent.setup();
  render(<Harness role="alertdialog" />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  await user.click(document.body);
  expect(screen.getByRole('alertdialog', { name: 'Schedule post' })).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('can only be closed by its own actions when not dismissable', async () => {
  const user = userEvent.setup();
  render(<Harness isDismissable={false} isKeyboardDismissDisabled />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await user.click(document.body);
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
