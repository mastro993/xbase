import { z } from 'zod';

// Shared by the Discover page, the server and the MCP tools: no server imports.

/** Whether a candidate came from the home timeline or from a saved search. */
export const CANDIDATE_SOURCES = ['home', 'search'] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export type SavedSearchDto = {
  id: string;
  name: string;
  /** X recent-search syntax, e.g. `(buildinpublic OR "indie hacker") lang:en -is:reply`. */
  query: string;
  /** A disabled search is kept but never run. */
  enabled: boolean;
  /** When the last run read it; null until one does. */
  lastRunAt: string | null;
  /** How many candidates that run produced. */
  lastCandidateCount: number;
  createdAt: string;
  updatedAt: string;
};

/** What a post's engagement looked like when it was read; X omits a metric it doesn't have. */
export type CandidateMetrics = {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
};

/** The post a candidate quotes, read in full before the candidate was kept. */
export type QuotedPostDto = {
  id: string;
  text: string;
  authorId: string | null;
  authorHandle: string | null;
};

/** One post worth replying to, as a run stored it. */
export type CandidateDto = {
  id: string;
  xPostId: string;
  /** The post on x.com. */
  url: string;
  source: CandidateSource;
  /** The saved search that found it; null when the home timeline did. */
  savedSearchId: string | null;
  authorId: string | null;
  authorHandle: string | null;
  authorName: string | null;
  authorFollowers: number | null;
  /** null when the follow list can't be read: the account's token lacks the follows.read scope. */
  authorFollowing: boolean | null;
  /** The full body, never X's truncated preview. */
  text: string;
  lang: string | null;
  postedAt: string;
  metrics: CandidateMetrics;
  hasMedia: boolean;
  isQuote: boolean;
  conversationId: string | null;
  quoted: QuotedPostDto | null;
  /** When this copy was read from X. */
  fetchedAt: string;
};

export const MAX_SEARCH_NAME = 60;
/** The X API's recent-search limit for self-serve accounts. */
export const MAX_SEARCH_QUERY = 512;

/**
 * Added to a saved query so X never bills replies or plain reposts: discovery drops both, and the
 * search that returns fewer is the cheaper one. Local filtering stays the backstop.
 */
export const SEARCH_FILTER_SUFFIX = ' -is:reply -is:retweet';

/**
 * The query as X receives it: the saved query plus the filters, when both still fit under the
 * 512-character limit. A query saved long before the suffix existed is sent as it is.
 */
export function searchQueryForX(query: string): string {
  const trimmed = query.trim();
  return trimmed.length + SEARCH_FILTER_SUFFIX.length <= MAX_SEARCH_QUERY
    ? `${trimmed}${SEARCH_FILTER_SUFFIX}`
    : trimmed;
}

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
export const SavedSearchEnabledInput = z.object({ id: Id, enabled: z.boolean() });
