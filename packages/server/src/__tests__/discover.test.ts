import { SavedSearchInput } from '@xbase/core/discover';
import { NotFoundError, ValidationError } from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import { discoveryCandidates } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSavedSearch,
  deleteSavedSearch,
  listCandidates,
  listSavedSearches,
  setSavedSearchEnabled,
  updateSavedSearch,
} from '../discover';

const NOW = new Date('2026-10-23T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  createTestDb();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('saved searches', () => {
  it('creates, trims and lists by name, ignoring case', () => {
    const search = createSavedSearch({ name: '  indie ', query: ' buildinpublic lang:en ' });
    expect(search).toEqual({
      id: expect.any(String),
      name: 'indie',
      query: 'buildinpublic lang:en',
      enabled: true,
      lastRunAt: null,
      lastCandidateCount: 0,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    createSavedSearch({ name: 'AI', query: 'llm' });
    createSavedSearch({ name: 'design', query: 'figma' });
    expect(listSavedSearches().map(({ name }) => name)).toEqual(['AI', 'design', 'indie']);
  });

  it('updates a search and bumps updatedAt', () => {
    const { id } = createSavedSearch({ name: 'a', query: 'b' });
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    expect(updateSavedSearch(id, { name: 'c', query: 'd' })).toMatchObject({
      id,
      name: 'c',
      query: 'd',
      createdAt: NOW.toISOString(),
      updatedAt: new Date(NOW.getTime() + 1000).toISOString(),
    });
    expect(() => updateSavedSearch('nope', { name: 'c', query: 'd' })).toThrow(NotFoundError);
  });

  it('turns a search off and back on, and keeps updatedAt', () => {
    const { id } = createSavedSearch({ name: 'a', query: 'b' });
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    expect(setSavedSearchEnabled(id, false)).toMatchObject({
      id,
      enabled: false,
      updatedAt: new Date(NOW.getTime() + 1000).toISOString(),
    });
    expect(listSavedSearches()[0]?.enabled).toBe(false);
    expect(setSavedSearchEnabled(id, true).enabled).toBe(true);
    expect(() => setSavedSearchEnabled('nope', false)).toThrow(NotFoundError);
  });

  it('deletes a search, quietly for an unknown id', () => {
    const { id } = createSavedSearch({ name: 'a', query: 'b' });
    deleteSavedSearch(id);
    expect(listSavedSearches()).toEqual([]);
    expect(() => deleteSavedSearch(id)).not.toThrow();
  });

  it('rejects empty fields and queries longer than X accepts', () => {
    expect(() => createSavedSearch({ name: ' ', query: 'x' })).toThrow('Name the search');
    expect(() => createSavedSearch({ name: 'x', query: '' })).toThrow(ValidationError);
    expect(() => createSavedSearch({ name: 'x'.repeat(61), query: 'x' })).toThrow(ValidationError);
    expect(SavedSearchInput.safeParse({ name: 'x', query: 'q'.repeat(512) }).success).toBe(true);
    expect(() => createSavedSearch({ name: 'x', query: 'q'.repeat(513) })).toThrow(/at most 512/);
    expect(listSavedSearches()).toEqual([]);
  });
});

describe('candidates', () => {
  let accountId: string;
  let searchId: string;

  const row = (id: string, overrides: Partial<typeof discoveryCandidates.$inferInsert> = {}) =>
    ({
      accountId,
      xPostId: id,
      source: 'search' as const,
      savedSearchId: searchId,
      url: `https://x.com/author/status/${id}`,
      text: `Post ${id}`,
      postedAt: NOW,
      fetchedAt: NOW,
      ...overrides,
    }) satisfies typeof discoveryCandidates.$inferInsert;

  beforeEach(() => {
    accountId = seedAccount({ id: '1001', username: 'owner' });
    searchId = createSavedSearch({ name: 'a', query: 'b' }).id;
  });

  it('lists one search’s candidates newest first, for one account only', () => {
    const otherSearch = createSavedSearch({ name: 'c', query: 'd' }).id;
    seedAccount({ id: '2002', username: 'other' });
    getDb()
      .insert(discoveryCandidates)
      .values([
        row('older', { postedAt: new Date(NOW.getTime() - 1_000) }),
        row('newer'),
        row('elsewhere', { savedSearchId: otherSearch }),
        row('theirs', { accountId: '2002' }),
      ])
      .run();

    expect(listCandidates(accountId, searchId).map(({ xPostId }) => xPostId)).toEqual([
      'newer',
      'older',
    ]);
    expect(listCandidates(accountId, otherSearch).map(({ xPostId }) => xPostId)).toEqual([
      'elsewhere',
    ]);
  });

  it('reads back the full post, its metrics and the post it quotes', () => {
    getDb()
      .insert(discoveryCandidates)
      .values(
        row('p1', {
          authorHandle: 'author',
          authorName: 'Author',
          authorFollowers: 2_400,
          authorFollowing: false,
          lang: 'en',
          views: 500,
          likes: 7,
          replies: 1,
          reposts: 2,
          quotes: 0,
          hasMedia: true,
          isQuote: true,
          conversationId: 'c1',
          quotedPostId: 'q1',
          quotedText: 'The quoted post, in full.',
          quotedAuthorId: 'a9',
          quotedAuthorHandle: 'quoted',
        }),
      )
      .run();

    expect(listCandidates(accountId, searchId)[0]).toMatchObject({
      xPostId: 'p1',
      url: 'https://x.com/author/status/p1',
      authorHandle: 'author',
      authorName: 'Author',
      authorFollowers: 2_400,
      authorFollowing: false,
      text: 'Post p1',
      lang: 'en',
      metrics: { views: 500, likes: 7, replies: 1, reposts: 2, quotes: 0 },
      hasMedia: true,
      isQuote: true,
      conversationId: 'c1',
      quoted: {
        id: 'q1',
        text: 'The quoted post, in full.',
        authorId: 'a9',
        authorHandle: 'quoted',
      },
    });
  });

  it('keeps a candidate when its saved search is deleted, with no search to point at', () => {
    getDb().insert(discoveryCandidates).values(row('p1')).run();
    deleteSavedSearch(searchId);
    const [candidate] = getDb().select().from(discoveryCandidates).all();
    expect(candidate?.savedSearchId).toBeNull();
    expect(listCandidates(accountId, searchId)).toEqual([]);
  });
});
