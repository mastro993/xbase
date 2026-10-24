import { SavedSearchInput } from '@xbase/core/discover';
import { NotFoundError, ValidationError } from '@xbase/core/errors';
import { createTestDb } from '@xbase/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
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
