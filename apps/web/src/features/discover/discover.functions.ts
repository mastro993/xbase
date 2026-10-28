import { createServerFn } from '@tanstack/react-start';
import {
  SavedSearchEnabledInput,
  SavedSearchIdInput,
  SavedSearchInput,
  UpdateSavedSearchInput,
} from '@xbase/core/discover';
import { validator } from '@xbase/core/validate';
import {
  createSavedSearch,
  deleteSavedSearch,
  listCandidates,
  listSavedSearches,
  setSavedSearchEnabled,
  updateSavedSearch,
} from '@xbase/server/discover';
import { runDiscovery } from '@xbase/server/discovery';
import { requireSession } from '@/features/auth/session.server';

// The Discover page's entry points to @xbase/server/discover and @xbase/server/discovery.

export const listSavedSearchesFn = createServerFn().handler(() =>
  listSavedSearches(requireSession().accountId),
);

export const listCandidatesFn = createServerFn()
  .validator(validator(SavedSearchIdInput))
  .handler(({ data }) => listCandidates(requireSession().accountId, data.id));

export const createSavedSearchFn = createServerFn({ method: 'POST' })
  .validator(validator(SavedSearchInput))
  .handler(({ data }) => createSavedSearch(data));

export const updateSavedSearchFn = createServerFn({ method: 'POST' })
  .validator(validator(UpdateSavedSearchInput))
  .handler(({ data: { id, ...fields } }) => updateSavedSearch(id, fields));

export const setSavedSearchEnabledFn = createServerFn({ method: 'POST' })
  .validator(validator(SavedSearchEnabledInput))
  .handler(({ data }) => setSavedSearchEnabled(data.id, data.enabled));

export const deleteSavedSearchFn = createServerFn({ method: 'POST' })
  .validator(validator(SavedSearchIdInput))
  .handler(({ data }) => deleteSavedSearch(data.id));

/** Reads the home timeline and every enabled search, as the account the browser works as. */
export const runDiscoveryFn = createServerFn({ method: 'POST' }).handler(() =>
  runDiscovery(requireSession().accountId),
);
