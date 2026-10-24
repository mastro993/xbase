// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { PostDto } from '../posts.schema';
import { QueueList } from '../QueueList';

afterEach(cleanup);

/** `hour` o'clock, `days` from today, so posts on one day never straddle midnight. */
const at = (days: number, hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const queued = (id: string, publishAt: string, extra: Partial<PostDto> = {}): PostDto => ({
  id,
  account: 'xbase',
  status: 'scheduled',
  parts: [`Post ${id}`],
  publishAt,
  publishedAt: null,
  xPostId: null,
  error: null,
  origin: 'web',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  ...extra,
});

function renderList(posts: PostDto[]) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <QueueList posts={posts} /> }),
    history: createMemoryHistory({ initialEntries: ['/queue'] }),
  });
  render(<RouterProvider router={router} />);
}

it('groups posts under a heading per day and says each state in words', async () => {
  renderList([
    queued('missed', at(-2, 10)),
    queued('failed', at(-2, 11), { status: 'failed', error: 'X returned 429.' }),
    queued('later', at(3, 10), { parts: ['First', 'Second'] }),
  ]);
  const headings = await screen.findAllByRole('heading', { level: 2 });
  expect(headings).toHaveLength(2);
  const [past, future] = headings.map((heading) => heading.closest('section')!);
  expect(
    within(past)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual([
    expect.stringContaining('Time passed, not sent'),
    expect.stringContaining('Failed to publish'),
  ]);
  expect(within(future).getByRole('link').textContent).toContain('Thread · 2 posts');
  expect(within(future).getByRole('link').getAttribute('href')).toBe('/queue/later');
  expect(screen.getByRole('note').textContent).toContain('Publishing isn’t connected yet');
});

it('says when nothing is scheduled', async () => {
  renderList([]);
  expect(await screen.findByText(/^Nothing scheduled\./)).toBeTruthy();
  expect(screen.queryByRole('heading')).toBeNull();
});
