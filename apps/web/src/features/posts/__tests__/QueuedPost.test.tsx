// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@xbase/core/posts/schema';
import { afterEach, expect, it, vi } from 'vitest';
import { QueuedPost } from '../QueuedPost';

// Server functions need the server: the page calls these stand-ins instead.
const server = vi.hoisted(() => ({ schedulePostFn: vi.fn(), unschedulePostFn: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: <T,>(fn: T) => fn }));
vi.mock('../posts.functions', () => server);

afterEach(cleanup);

const post: PostDto = {
  id: 'p1',
  account: 'xbase',
  status: 'scheduled',
  parts: ['Hello there'],
  publishAt: '2026-11-02T10:00:00.000Z',
  publishedAt: null,
  xPostId: null,
  error: null,
  origin: 'web',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

it('unschedules into the drafts and gives focus to the page heading', async () => {
  server.unschedulePostFn.mockResolvedValue({ ...post, status: 'draft', publishAt: null });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const queued = createRoute({
    getParentRoute: () => rootRoute,
    path: '/queue/$postId',
    component: () => <QueuedPost post={post} />,
  });
  const draft = createRoute({
    getParentRoute: () => rootRoute,
    path: '/drafts/$draftId',
    // SplitView's h1, which focusPageHeading looks for.
    component: () => (
      <h1 data-page-heading tabIndex={-1}>
        Drafts
      </h1>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([queued, draft]),
    history: createMemoryHistory({ initialEntries: ['/queue/p1'] }),
  });
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();

  await user.click(await screen.findByRole('button', { name: 'Unschedule' }));
  expect(server.unschedulePostFn).toHaveBeenCalledWith({ data: { id: 'p1' } });
  const heading = await screen.findByRole('heading', { level: 1, name: 'Drafts' });
  expect(router.state.location.pathname).toBe('/drafts/p1');
  await vi.waitFor(() => expect(document.activeElement).toBe(heading));
});
