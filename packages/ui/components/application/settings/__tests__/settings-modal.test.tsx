import { AiBrain01Icon, Settings01Icon } from '@hugeicons/core-free-icons';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SettingsModal, type SettingsNavSection } from '../settings-modal';

const SECTIONS: SettingsNavSection[] = [
  {
    label: 'Account',
    items: [
      { id: 'accounts', label: 'Accounts', icon: Settings01Icon },
      { id: 'sessions', label: 'Sessions', icon: Settings01Icon },
    ],
  },
  {
    label: 'AI',
    items: [{ id: 'provider', label: 'Provider', icon: AiBrain01Icon }],
  },
];

const TITLES = new Map(
  SECTIONS.flatMap((section) => section.items.map((item) => [item.id, item.label])),
);

function Harness({ onPageChange = vi.fn() }: { onPageChange?: (page: string) => void }) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState('accounts');
  return (
    <SettingsModal
      isOpen={open}
      onOpenChange={setOpen}
      page={page}
      onPageChange={(next) => {
        setPage(next);
        onPageChange(next);
      }}
      sections={SECTIONS}
      title={TITLES.get(page) ?? ''}
    >
      <p>{page} content</p>
    </SettingsModal>
  );
}

it('groups the pages, marks the current one, and changes page', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(<Harness onPageChange={onPageChange} />);
  const dialog = screen.getByRole('dialog', { name: 'Accounts' });
  expect(within(dialog).getByText('accounts content')).toBeDefined();
  const nav = within(dialog).getByRole('navigation', { name: 'Settings sections' });
  expect(within(nav).getByRole('group', { name: 'Account' })).toBeDefined();
  expect(within(nav).getByRole('group', { name: 'AI' })).toBeDefined();
  expect(within(nav).getByRole('button', { name: 'Accounts' }).getAttribute('aria-current')).toBe(
    'page',
  );

  await user.click(within(nav).getByRole('button', { name: 'Provider' }));
  expect(onPageChange).toHaveBeenCalledWith('provider');
  expect(screen.getByRole('dialog', { name: 'Provider' })).toBeDefined();
  expect(within(dialog).getByText('provider content')).toBeDefined();
  expect(within(nav).getByRole('button', { name: 'Provider' }).getAttribute('aria-current')).toBe(
    'page',
  );
});

it('closes on Escape', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByRole('dialog', { name: 'Accounts' })).toBeDefined();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes from its close button', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Close settings' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
