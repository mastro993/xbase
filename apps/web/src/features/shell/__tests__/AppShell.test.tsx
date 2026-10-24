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
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { SplitView } from '../SplitView';

// The server function's module needs the server; the shell only reads its URL.
vi.mock('@/features/auth/auth.functions', () => ({ logoutFn: { url: '/_serverFn/logout' } }));

afterEach(cleanup);

function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
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

it('signs out with a native POST', async () => {
  renderAt('/queue');
  const signOut = await screen.findByRole('button', { name: 'Sign out' });
  expect(signOut.getAttribute('type')).toBe('submit');
  const form = signOut.closest('form');
  expect(form?.getAttribute('method')).toBe('post');
  expect(form?.getAttribute('action')).toBe('/_serverFn/logout');
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
