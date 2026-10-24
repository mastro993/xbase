import { eq, sql } from 'drizzle-orm';
import { NotFoundError } from '@/lib/errors';
import { parseInput } from '@/lib/validate';
import { getDb } from '@/server/db/client.server';
import { type SavedSearch, savedSearches } from '@/server/db/schema';
import { SavedSearchInput, type SavedSearchDto } from './discover.schema';

// Saved X searches for the Discover page. Running them needs the X API, which comes later.

type Fields = { name: string; query: string };

function toDto(row: SavedSearch): SavedSearchDto {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

/** A search that's already gone is fine. */
export function deleteSavedSearch(id: string): void {
  getDb().delete(savedSearches).where(eq(savedSearches.id, id)).run();
}
