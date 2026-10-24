import { createServerFn } from '@tanstack/react-start';
import { validator } from '@/lib/validate';
import { SavedSearchIdInput, SavedSearchInput, UpdateSavedSearchInput } from './discover.schema';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  updateSavedSearch,
} from './discover.server';

// The Discover page's entry points to discover.server.ts.

export const listSavedSearchesFn = createServerFn().handler(() => listSavedSearches());

export const createSavedSearchFn = createServerFn({ method: 'POST' })
  .validator(validator(SavedSearchInput))
  .handler(({ data }) => createSavedSearch(data));

export const updateSavedSearchFn = createServerFn({ method: 'POST' })
  .validator(validator(UpdateSavedSearchInput))
  .handler(({ data: { id, ...fields } }) => updateSavedSearch(id, fields));

export const deleteSavedSearchFn = createServerFn({ method: 'POST' })
  .validator(validator(SavedSearchIdInput))
  .handler(({ data }) => deleteSavedSearch(data.id));
