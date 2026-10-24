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
import { afterEach, expect, it } from 'vitest';
import { SavedSearchNotFound } from '../SavedSearchNotFound';

afterEach(cleanup);

it('leads back to Discover without claiming the current page', async () => {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/discover">Rail</Link>
        <Outlet />
      </>
    ),
  });
  const routes = ['/discover', '/discover/$searchId'].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: SavedSearchNotFound }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/discover/gone'] }),
  });
  render(<RouterProvider router={router} />);
  const back = await screen.findByRole('link', { name: 'Back to Discover' });
  expect(back.getAttribute('href')).toBe('/discover');
  expect(back.getAttribute('aria-current')).toBeNull();
  expect(screen.getByRole('link', { name: 'Rail' }).getAttribute('aria-current')).toBe('page');
});
