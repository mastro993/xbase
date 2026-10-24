import { z } from 'zod';

// Shared by the Discover page and the server: no server imports.

export type SavedSearchDto = {
  id: string;
  name: string;
  /** X recent-search syntax, e.g. `(buildinpublic OR "indie hacker") lang:en -is:reply`. */
  query: string;
  createdAt: string;
  updatedAt: string;
};

export const MAX_SEARCH_NAME = 60;
/** The X API's recent-search limit for self-serve accounts. */
export const MAX_SEARCH_QUERY = 512;

const Id = z.string().min(1).max(100);
export const SavedSearchInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name the search')
    .max(MAX_SEARCH_NAME, `A name can have at most ${MAX_SEARCH_NAME} characters`),
  query: z
    .string()
    .trim()
    .min(1, 'Enter a search query')
    .max(MAX_SEARCH_QUERY, `X accepts queries of at most ${MAX_SEARCH_QUERY} characters`),
});

export const UpdateSavedSearchInput = SavedSearchInput.extend({ id: Id });
export const SavedSearchIdInput = z.object({ id: Id });
