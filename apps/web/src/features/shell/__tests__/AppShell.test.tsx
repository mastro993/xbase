// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountsDto } from '@xbase/core/accounts';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { SplitView } from '../SplitView';

// Server function modules need the server; the shell only reads the logout URL.
vi.mock('@/features/auth/auth.functions', () => ({ logoutFn: { url: '/_serverFn/logout' } }));
vi.mock('@/features/accounts/accounts.functions', () => ({ switchAccountFn: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: <T,>(fn: T) => fn }));

const me = {
  id: '1001',
  username: 'xbase',
  name: 'XBase',
  avatarUrl: null,
  reconnectRequired: false,
};
const accounts: AccountsDto = {
  current: me,
  accounts: [
    me,
    { id: '2002', username: 'other', name: 'Other', avatarUrl: null, reconnectRequired: false },
  ],
};

afterEach(cleanup);

function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell accounts={accounts}>
        <Outlet />
      </AppShell>
    ),
  });
  const page = (routePath: string, title: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: routePath,
      component: () => (
        <SplitView
          title={title}
          list={<p>List</p>}
          detail={routePath.includes('$')}
          backTo="/drafts"
        >
          <p>Workbench</p>
        </SplitView>
      ),
    });
  const routeTree = rootRoute.addChildren([
    page('/', 'Home'),
    page('/discover', 'Discover'),
    page('/drafts', 'Drafts'),
    page('/drafts/$draftId', 'Drafts'),
    page('/queue', 'Queue'),
    page('/stats', 'Stats'),
    page('/settings', 'Settings'),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

it('marks the current section in the rail, child pages included', async () => {
  renderAt('/drafts/abc');
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  const links = within(nav).getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual([
    'Discover',
    'Drafts',
    'Queue',
    'Stats',
    'Settings',
  ]);
  expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toEqual([
    within(nav).getByRole('link', { name: 'Drafts' }),
  ]);
  // The home links (rail and phone top bar) only redirect, so they never claim the current page.
  for (const home of screen.getAllByRole('link', { name: 'XBase home' })) {
    expect(home.getAttribute('aria-current')).toBeNull();
  }
});

it('signs out from the account menu, with a native POST', async () => {
  const user = userEvent.setup();
  renderAt('/queue');
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  await user.click(
    await screen.findByRole('button', { name: 'Working as @xbase. Switch account' }),
  );
  const signOut = await screen.findByRole('button', { name: 'Sign out' });
  expect(signOut.getAttribute('type')).toBe('submit');
  const form = signOut.closest('form');
  expect(form?.getAttribute('method')).toBe('post');
  expect(form?.getAttribute('action')).toBe('/_serverFn/logout');
});

it('shows the account this browser works as, in the rail and the drawer', async () => {
  const user = userEvent.setup();
  renderAt('/queue');
  const name = 'Working as @xbase. Switch account';
  expect(await screen.findAllByRole('button', { name })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  const drawer = screen.getByRole('dialog', { name: 'Navigation' });
  expect(within(drawer).getByRole('button', { name }).textContent).toContain('@xbase');
});

it('opens the navigation in a drawer that closes when a link is followed', async () => {
  const user = userEvent.setup();
  const router = renderAt('/drafts');
  const open = await screen.findByRole('button', { name: 'Open navigation' });
  expect(open.getAttribute('aria-expanded')).toBe('false');
  await user.click(open);
  const drawer = screen.getByRole('dialog', { name: 'Navigation' });
  expect(open.getAttribute('aria-expanded')).toBe('true');
  expect(within(drawer).getByRole('link', { name: 'Drafts' }).getAttribute('aria-current')).toBe(
    'page',
  );
  await user.click(within(drawer).getByRole('link', { name: 'Queue' }));
  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/queue'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('heading', { level: 1, name: 'Queue' })).toBeDefined();
});

it('positions every scroll box, so absolutely positioned content stays inside it', async () => {
  renderAt('/drafts/abc');
  await screen.findByText('Workbench');
  // Without `relative`, sr-only status lines escape their scroll box and stretch the page itself,
  // which then scrolls past its content. happy-dom has no layout, so this checks the class.
  const scrollBoxes = [
    screen.getByRole('main'),
    screen.getByText('List').parentElement,
    screen.getByText('Workbench').parentElement,
  ];
  for (const box of scrollBoxes) {
    expect(box?.classList).toContain('overflow-y-auto');
    expect(box?.classList).toContain('relative');
  }
});

it('keeps the page heading focusable, with a way back from a detail page', async () => {
  renderAt('/drafts/abc');
  const heading = await screen.findByRole('heading', { level: 1, name: 'Drafts' });
  expect(heading.hasAttribute('data-page-heading')).toBe(true);
  expect(heading.tabIndex).toBe(-1);
  const back = screen.getByRole('link', { name: 'Back to Drafts' });
  expect(back.getAttribute('href')).toBe('/drafts');
  // It leads to the list; the open item, not the list, is the current page.
  expect(back.getAttribute('aria-current')).toBeNull();
});
