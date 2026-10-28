// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CandidateDto, SavedSearchDto } from '@xbase/core/discover';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SavedSearchView } from '../SavedSearchView';

const mocks = vi.hoisted(() => ({
  setSavedSearchEnabledFn: vi.fn(),
  deleteSavedSearchFn: vi.fn(async () => {}),
  runDiscoveryFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server functions' module and the account menu need the server; the view only calls them.
vi.mock('../discover.functions', () => ({
  createSavedSearchFn: vi.fn(),
  deleteSavedSearchFn: mocks.deleteSavedSearchFn,
  listCandidatesFn: vi.fn(),
  listSavedSearchesFn: vi.fn(),
  runDiscoveryFn: mocks.runDiscoveryFn,
  setSavedSearchEnabledFn: mocks.setSavedSearchEnabledFn,
  updateSavedSearchFn: vi.fn(),
}));
vi.mock('@/features/accounts/AccountMenu', () => ({
  ADD_ACCOUNT_HREF: '/auth/x/start?intent=add',
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));

const SEARCH: SavedSearchDto = {
  id: 's1',
  name: 'Indie makers',
  query: 'buildinpublic lang:en',
  enabled: true,
  lastRunAt: null,
  lastCandidateCount: 0,
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
};

const CANDIDATE: CandidateDto = {
  id: 'c1',
  xPostId: 'p1',
  url: 'https://x.com/alice/status/p1',
  source: 'search',
  savedSearchId: 's1',
  authorId: 'a1',
  authorHandle: 'alice',
  authorName: 'Alice',
  authorFollowers: 2_400,
  authorFollowing: false,
  text: 'The whole long post, with the ending X hides.',
  lang: 'en',
  postedAt: '2026-10-27T14:00:00.000Z',
  metrics: { views: 500, likes: 7, replies: 1, reposts: 2, quotes: 0 },
  hasMedia: false,
  isQuote: true,
  conversationId: 'c1',
  quoted: {
    id: 'q1',
    text: 'The quoted post, in full.',
    authorId: 'a9',
    authorHandle: 'quoted',
  },
  fetchedAt: '2026-10-27T15:00:00.000Z',
};

beforeEach(() => {
  mocks.setSavedSearchEnabledFn.mockReset();
  mocks.runDiscoveryFn.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

it('shows the candidates in full, with the post they quote', () => {
  render(<SavedSearchView search={SEARCH} candidates={[CANDIDATE]} canRead />);
  expect(screen.getByText('The whole long post, with the ending X hides.')).toBeTruthy();
  expect(screen.getByText('The quoted post, in full.')).toBeTruthy();
  expect(screen.getByText('@alice')).toBeTruthy();
  expect(screen.getByText('@quoted')).toBeTruthy();
  expect(screen.queryByText('Results need the X API')).toBeNull();
});

it('asks to reconnect only when the account’s X access no longer works', () => {
  render(<SavedSearchView search={SEARCH} candidates={[]} canRead={false} />);
  expect(screen.getByText('Results need the X API')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
    '/auth/x/start?intent=add',
  );
  // No paid read can go out with that account.
  expect(screen.queryByRole('button', { name: 'Run discovery' })).toBeNull();
});

it('turns a search off and refreshes the page', async () => {
  const user = userEvent.setup();
  mocks.setSavedSearchEnabledFn.mockResolvedValue({ ...SEARCH, enabled: false });
  render(<SavedSearchView search={SEARCH} candidates={[]} canRead />);

  await user.click(screen.getByRole('switch', { name: 'Run this search' }));
  expect(mocks.setSavedSearchEnabledFn).toHaveBeenCalledWith({
    data: { id: 's1', enabled: false },
  });
  expect(mocks.invalidate).toHaveBeenCalled();
});

it('runs discovery and reports what it kept', async () => {
  const user = userEvent.setup();
  mocks.runDiscoveryFn.mockResolvedValue({
    startedAt: '2026-10-27T15:00:00.000Z',
    home: 3,
    searches: [{ id: 's1', name: 'Indie makers', candidates: 4 }],
    dropped: [],
    stop: null,
  });
  render(<SavedSearchView search={SEARCH} candidates={[]} canRead />);

  await user.click(screen.getByRole('button', { name: 'Run discovery' }));
  expect(mocks.runDiscoveryFn).toHaveBeenCalled();
  expect(await screen.findByText(/7 candidates from your home timeline and 1 search/)).toBeTruthy();
  expect(mocks.invalidate).toHaveBeenCalled();
});
