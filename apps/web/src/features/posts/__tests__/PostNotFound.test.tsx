// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, expect, it } from 'vitest';
import { DraftNotFound, NotQueued } from '../PostNotFound';

afterEach(cleanup);

/** Renders `page` at `path`, under a stand-in for the rail's link to `section`. */
function renderAt(section: '/drafts' | '/queue', path: string, page: () => ReactElement) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to={section}>Rail</Link>
        <Outlet />
      </>
    ),
  });
  const routes = ['/drafts', '/drafts/$draftId', '/queue', '/queue/$postId'].map((routePath) =>
    createRoute({ getParentRoute: () => rootRoute, path: routePath, component: page }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

it.each([
  ['/drafts', '/drafts/gone', DraftNotFound, 'Back to drafts'],
  ['/queue', '/queue/gone', () => <NotQueued />, 'Back to the queue'],
] as const)(
  'on %s/<unknown id>, Back leads to the list without claiming the current page',
  async (section, path, page, back) => {
    renderAt(section, path, page);
    const link = await screen.findByRole('link', { name: back });
    expect(link.getAttribute('href')).toBe(section);
    expect(link.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Rail' }).getAttribute('aria-current')).toBe('page');
  },
);

it('sends an unscheduled post to its draft', async () => {
  renderAt('/queue', '/queue/p1', () => <NotQueued draftId="p1" />);
  const link = await screen.findByRole('link', { name: 'Open the draft' });
  expect(link.getAttribute('href')).toBe('/drafts/p1');
  expect(screen.getByText('It was unscheduled and is a draft again.')).toBeDefined();
});
