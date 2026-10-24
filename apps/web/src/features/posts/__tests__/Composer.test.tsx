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
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AI_NOT_CONFIGURED } from '@xbase/core/ai';
import type { PostDto } from '@xbase/core/posts/schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Composer } from '../Composer';

// Server functions need the server: the composer calls these stand-ins instead.
const server = vi.hoisted(() => ({
  updateDraftFn: vi.fn(),
  schedulePostFn: vi.fn(),
  unschedulePostFn: vi.fn(),
  deletePostFn: vi.fn(),
  refineDraftFn: vi.fn(),
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: <T,>(fn: T) => fn }));
vi.mock('../posts.functions', () => server);
vi.mock('@/features/ai/ai.functions', () => ({ refineDraftFn: server.refineDraftFn }));

beforeEach(() => {
  for (const fn of Object.values(server)) fn.mockReset();
  server.updateDraftFn.mockImplementation(async ({ data }: { data: { parts: string[] } }) => ({
    ...post,
    parts: data.parts,
  }));
});
afterEach(cleanup);

const post: PostDto = {
  id: 'p1',
  account: 'xbase',
  status: 'draft',
  parts: ['Hello there'],
  publishAt: null,
  publishedAt: null,
  xPostId: null,
  error: null,
  origin: 'web',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

function renderComposer(aiReady: boolean) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/queue">Queue</Link>
        <Outlet />
      </>
    ),
  });
  const draft = createRoute({
    getParentRoute: () => rootRoute,
    path: '/drafts/$draftId',
    component: () => <Composer post={post} aiReady={aiReady} />,
  });
  const queue = createRoute({
    getParentRoute: () => rootRoute,
    path: '/queue',
    component: () => <p>The queue</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([draft, queue]),
    history: createMemoryHistory({ initialEntries: ['/drafts/p1'] }),
  });
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}

const status = () => screen.getAllByRole('status')[0]?.textContent;

it('saves with ⌘S or Ctrl+S from anywhere on the page, and says so', async () => {
  const { user } = renderComposer(false);
  const field = await screen.findByRole('textbox', { name: 'Post' });
  expect(status()).toMatch(/^Saved /);
  await user.type(field, '!');
  expect(status()).toBe('Unsaved changes');
  await user.keyboard('{Control>}s{/Control}');
  expect(server.updateDraftFn).toHaveBeenCalledWith({
    data: { id: 'p1', parts: ['Hello there!'] },
  });
  await vi.waitFor(() => expect(status()).toMatch(/^Saved /));
  // Nothing to save: no request.
  await user.click(document.body);
  await user.keyboard('{Meta>}s{/Meta}');
  expect(server.updateDraftFn).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-keyshortcuts')).toBe(
    'Meta+S Control+S',
  );
});

it('asks before a navigation drops unsaved edits', async () => {
  const { router, user } = renderComposer(false);
  const field = await screen.findByRole('textbox', { name: 'Post' });
  await user.type(field, ' and more');
  await user.click(screen.getByRole('link', { name: 'Queue' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' });
  await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(router.state.location.pathname).toBe('/drafts/p1');
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('Hello there and more');

  await user.click(screen.getByRole('link', { name: 'Queue' }));
  await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
  await screen.findByText('The queue');
  expect(router.state.location.pathname).toBe('/queue');
});

it('without an AI provider, keeps Refine unavailable and says where to set one up', async () => {
  const { user } = renderComposer(false);
  const refine = await screen.findByRole('button', { name: 'Refine with AI' });
  expect(refine.getAttribute('aria-disabled')).toBe('true');
  const hint = document.getElementById(refine.getAttribute('aria-describedby') ?? '');
  expect(hint?.textContent).toBe('Refine with AI needs an AI provider. Set one up in Settings');
  expect(within(hint!).getByRole('link').getAttribute('href')).toBe('/settings');
  await user.click(refine);
  expect(server.refineDraftFn).not.toHaveBeenCalled();
});

it('refines a part, focuses the result, and Undo puts the text back', async () => {
  server.refineDraftFn.mockResolvedValue({ text: 'General Kenobi.' });
  const { user } = renderComposer(true);
  const field = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Post' });
  await user.click(screen.getByRole('button', { name: 'Refine with AI' }));
  expect(server.refineDraftFn).toHaveBeenCalledWith({ data: { text: 'Hello there' } });
  await vi.waitFor(() => expect(field.value).toBe('General Kenobi.'));
  await vi.waitFor(() => expect(document.activeElement).toBe(field));
  expect(status()).toBe('Unsaved changes');
  await user.click(screen.getByRole('button', { name: 'Undo refine' }));
  expect(field.value).toBe('Hello there');
  expect(screen.queryByRole('button', { name: 'Undo refine' })).toBeNull();
  // Undo is gone, so focus goes to the restored text rather than <body>.
  expect(document.activeElement).toBe(field);
});

it('shows a refine error, with a way to Settings when no provider is set up', async () => {
  server.refineDraftFn.mockRejectedValue(new Error(AI_NOT_CONFIGURED));
  const { user } = renderComposer(true);
  await user.click(await screen.findByRole('button', { name: 'Refine with AI' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Couldn’t refine');
  expect(alert.textContent).toContain(AI_NOT_CONFIGURED);
  expect(within(alert).getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe(
    '/settings',
  );
});
