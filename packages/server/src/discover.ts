import { type CandidateDto, SavedSearchInput, type SavedSearchDto } from '@xbase/core/discover';
import { NotFoundError } from '@xbase/core/errors';
import { parseInput } from '@xbase/core/validate';
import { getDb } from '@xbase/db/client';
import {
  type DiscoveryCandidate,
  discoveryCandidates,
  type SavedSearch,
  savedSearches,
} from '@xbase/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

// Saved X searches for the Discover page, and the candidates a run stored for them. The run
// itself is @xbase/server/discovery/fetch; this module is the page's reads and its toggle.

type Fields = { name: string; query: string };

/** The newest candidates the page shows for one search. */
const CANDIDATE_LIST_LIMIT = 50;

function toDto(row: SavedSearch): SavedSearchDto {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastCandidateCount: row.lastCandidateCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const toCandidateDto = (row: DiscoveryCandidate): CandidateDto => ({
  id: row.id,
  xPostId: row.xPostId,
  url: row.url,
  source: row.source,
  savedSearchId: row.savedSearchId,
  authorId: row.authorId,
  authorHandle: row.authorHandle,
  authorName: row.authorName,
  authorFollowers: row.authorFollowers,
  authorFollowing: row.authorFollowing,
  text: row.text,
  lang: row.lang,
  postedAt: row.postedAt.toISOString(),
  metrics: {
    views: row.views,
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    quotes: row.quotes,
  },
  hasMedia: row.hasMedia,
  isQuote: row.isQuote,
  conversationId: row.conversationId,
  quoted:
    row.quotedPostId === null
      ? null
      : {
          id: row.quotedPostId,
          text: row.quotedText ?? '',
          authorId: row.quotedAuthorId,
          authorHandle: row.quotedAuthorHandle,
        },
  fetchedAt: row.fetchedAt.toISOString(),
});

/** By name, ignoring case. */
export function listSavedSearches(): SavedSearchDto[] {
  return getDb()
    .select()
    .from(savedSearches)
    .orderBy(sql`${savedSearches.name} collate nocase`, savedSearches.createdAt)
    .all()
    .map(toDto);
}

export function createSavedSearch(fields: Fields): SavedSearchDto {
  const values = parseInput(SavedSearchInput, fields);
  return toDto(getDb().insert(savedSearches).values(values).returning().get());
}

/** Throws NotFoundError. */
export function updateSavedSearch(id: string, fields: Fields): SavedSearchDto {
  const values = parseInput(SavedSearchInput, fields);
  const row = getDb()
    .update(savedSearches)
    .set(values)
    .where(eq(savedSearches.id, id))
    .returning()
    .get();
  if (!row) throw new NotFoundError('Saved search not found.');
  return toDto(row);
}

/** Turns a search's future runs on or off; the searches already stored stay. Throws NotFoundError. */
export function setSavedSearchEnabled(id: string, enabled: boolean): SavedSearchDto {
  const row = getDb()
    .update(savedSearches)
    .set({ enabled })
    .where(eq(savedSearches.id, id))
    .returning()
    .get();
  if (!row) throw new NotFoundError('Saved search not found.');
  return toDto(row);
}

/** A search that's already gone is fine. Its candidates keep, with no search to point at. */
export function deleteSavedSearch(id: string): void {
  getDb().delete(savedSearches).where(eq(savedSearches.id, id)).run();
}

/** One search's newest candidates for this account, most recently posted first. */
export function listCandidates(accountId: string, savedSearchId: string): CandidateDto[] {
  return getDb()
    .select()
    .from(discoveryCandidates)
    .where(
      and(
        eq(discoveryCandidates.accountId, accountId),
        eq(discoveryCandidates.savedSearchId, savedSearchId),
      ),
    )
    .orderBy(desc(discoveryCandidates.postedAt), desc(discoveryCandidates.fetchedAt))
    .limit(CANDIDATE_LIST_LIMIT)
    .all()
    .map(toCandidateDto);
}
