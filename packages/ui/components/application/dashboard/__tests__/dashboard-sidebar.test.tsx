import { RiDraftLine, RiLogoutBoxRLine, RiSettings4Line } from '@remixicon/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import {
  DashboardSidebar,
  SidebarDrawer,
  SidebarNavButton,
  SidebarNavItem,
} from '../dashboard-sidebar';

function Rows() {
  return (
    <>
      <SidebarNavItem href="/drafts" icon={RiDraftLine} label="Drafts" aria-current="page" />
      <SidebarNavItem href="/settings" icon={RiSettings4Line} label="Settings" />
    </>
  );
}

it('names its navigation and keeps hidden labels as the rows’ names', () => {
  render(
    <DashboardSidebar
      collapsed
      footer={<SidebarNavButton icon={RiLogoutBoxRLine} label="Sign out" />}
    >
      <Rows />
    </DashboardSidebar>,
  );
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(nav.contains(screen.getByRole('link', { name: 'Drafts' }))).toBe(true);
  expect(screen.getByRole('link', { name: 'Drafts' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Sign out' }).getAttribute('type')).toBe('button');
});

it('shows a collapsed row’s label in a tooltip on keyboard focus', async () => {
  const user = userEvent.setup();
  render(
    <DashboardSidebar collapsed>
      <Rows />
    </DashboardSidebar>,
  );
  expect(screen.queryByRole('tooltip')).toBeNull();
  await user.keyboard('{Tab}');
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Drafts' }));
  expect(screen.getByRole('tooltip').textContent).toBe('Drafts');
  await user.keyboard('{Tab}');
  expect(screen.getByRole('tooltip').textContent).toBe('Settings');
});

it('has no tooltips when expanded', async () => {
  const user = userEvent.setup();
  render(
    <DashboardSidebar>
      <Rows />
    </DashboardSidebar>,
  );
  await user.keyboard('{Tab}');
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Drafts' }));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

function Drawer({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    onOpenChange(next);
    setOpen(next);
  };
  return (
    <>
      <button type="button" onClick={() => change(true)}>
        Open navigation
      </button>
      <SidebarDrawer isOpen={open} onOpenChange={change}>
        <DashboardSidebar mobile onClose={() => change(false)}>
          <Rows />
        </DashboardSidebar>
      </SidebarDrawer>
    </>
  );
}

it('opens in a drawer that closes on Escape and gives focus back', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(<Drawer onOpenChange={onOpenChange} />);
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  const dialog = screen.getByRole('dialog', { name: 'Navigation' });
  expect(dialog.contains(document.activeElement)).toBe(true);
  // Expanded inside the drawer: no tooltips, and a close button.
  expect(dialog.contains(screen.getByRole('button', { name: 'Close navigation' }))).toBe(true);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open navigation' }));
});

it('closes the drawer from its close button', async () => {
  const user = userEvent.setup();
  render(<Drawer onOpenChange={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  await user.click(screen.getByRole('button', { name: 'Close navigation' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
