import { createServerFn } from '@tanstack/react-start';
import { SavedSearchIdInput, SavedSearchInput, UpdateSavedSearchInput } from '@xbase/core/discover';
import { validator } from '@xbase/core/validate';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  updateSavedSearch,
} from '@xbase/server/discover';

// The Discover page's entry points to @xbase/server/discover.

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
