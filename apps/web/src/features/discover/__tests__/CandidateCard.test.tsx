// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CandidateDto } from '@xbase/core/discover';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CandidateCard } from '../CandidateCard';

const mocks = vi.hoisted(() => ({
  markCandidateRepliedFn: vi.fn(),
  skipCandidateFn: vi.fn(),
  muteCandidateAuthorFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server functions' module needs the server; the card only calls them.
vi.mock('../discover.functions', () => ({
  markCandidateRepliedFn: mocks.markCandidateRepliedFn,
  muteCandidateAuthorFn: mocks.muteCandidateAuthorFn,
  skipCandidateFn: mocks.skipCandidateFn,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));

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
  text: 'Shipped the new onboarding today.',
  lang: 'en',
  postedAt: '2026-10-27T14:00:00.000Z',
  metrics: { views: 500, likes: 7, replies: 1, reposts: 2, quotes: 0 },
  hasMedia: false,
  isQuote: false,
  conversationId: 'p1',
  quoted: null,
  fetchedAt: '2026-10-27T15:00:00.000Z',
};

beforeEach(() => {
  for (const mock of [
    mocks.markCandidateRepliedFn,
    mocks.skipCandidateFn,
    mocks.muteCandidateAuthorFn,
  ]) {
    mock.mockReset();
    mock.mockResolvedValue(undefined);
  }
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

it.each([
  ['Mark replied', mocks.markCandidateRepliedFn],
  ['Skip', mocks.skipCandidateFn],
])('%s takes the candidate off the list', async (name, action) => {
  const user = userEvent.setup();
  render(<CandidateCard candidate={CANDIDATE} />);

  await user.click(screen.getByRole('button', { name }));
  expect(action).toHaveBeenCalledWith({ data: { id: 'c1' } });
  expect(mocks.invalidate).toHaveBeenCalled();
});

it('shows why an action failed, and lets it be tried again', async () => {
  const user = userEvent.setup();
  mocks.skipCandidateFn.mockRejectedValueOnce(new Error('Candidate not found.'));
  render(<CandidateCard candidate={CANDIDATE} />);

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Candidate not found.');
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Skip' }).hasAttribute('disabled')).toBe(false);
});

it('mutes the author only once the dialog is confirmed', async () => {
  const user = userEvent.setup();
  render(<CandidateCard candidate={CANDIDATE} />);

  await user.click(screen.getByRole('button', { name: 'Mute author @alice' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Mute @alice?' });
  expect(mocks.muteCandidateAuthorFn).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Mute' }));
  expect(mocks.muteCandidateAuthorFn).toHaveBeenCalledWith({ data: { id: 'c1' } });
  expect(mocks.invalidate).toHaveBeenCalled();
});

it('offers no mute for a post without an author handle', () => {
  render(<CandidateCard candidate={{ ...CANDIDATE, authorHandle: null }} />);
  expect(screen.queryByRole('button', { name: /Mute/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
});
