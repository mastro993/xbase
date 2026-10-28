import {
  type DiscoverySection,
  type DiscoverySettings,
  parseDiscoverySection,
  readDiscoverySettings,
} from '@xbase/core/discovery';
import { NotFoundError } from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import { xAccounts } from '@xbase/db/schema';
import { eq } from 'drizzle-orm';
import { refilterCandidates } from './discovery/filter';

// Reply discovery's settings, in one JSON column per X account. Settings saves them a section at
// a time; a discovery run reads them as it goes, which is how a change applies to the next run.
// A change to what the filters read applies to the candidates already stored, too. The REST API
// and the MCP tools can call these too.

/** The sections the filters and the age cap read: saving one re-checks the stored candidates. */
const FILTERED_SECTIONS = new Set<DiscoverySection>([
  'niches',
  'watch',
  'exclusions',
  'thresholds',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The sections the account saved, exactly as stored; throws NotFoundError. */
function readDocument(accountId: string): Record<string, unknown> {
  const row = getDb()
    .select({ discovery: xAccounts.discovery })
    .from(xAccounts)
    .where(eq(xAccounts.id, accountId))
    .get();
  if (!row) throw new NotFoundError('Account not found.');
  return isRecord(row.discovery) ? row.discovery : {};
}

/** Only the sections saved so far: a new default then reaches accounts that never changed it. */
function writeDocument(accountId: string, document: Record<string, unknown> | null): void {
  getDb().update(xAccounts).set({ discovery: document }).where(eq(xAccounts.id, accountId)).run();
}

/** Stores the document and returns every setting, re-checking candidates when filters changed. */
function store(
  accountId: string,
  section: DiscoverySection,
  document: Record<string, unknown> | null,
): DiscoverySettings {
  writeDocument(accountId, document);
  const settings = readDiscoverySettings(document);
  if (FILTERED_SECTIONS.has(section)) refilterCandidates(accountId, settings, new Date());
  return settings;
}

/** Every setting for the account: what it saved, over the defaults for the rest. */
export function getDiscoverySettings(accountId: string): DiscoverySettings {
  return readDiscoverySettings(readDocument(accountId));
}

/**
 * Saves one section, normalised, and returns every setting: the page shows back what was stored,
 * and callers that change one section keep the others.
 */
export function saveDiscoverySettings(
  accountId: string,
  section: DiscoverySection,
  value: unknown,
): DiscoverySettings {
  return getDb().transaction(() => {
    const document = readDocument(accountId);
    return store(accountId, section, {
      ...document,
      [section]: parseDiscoverySection(section, value),
    });
  });
}

/** Forgets one section's saved value, so it reads as its defaults again; the others stay. */
export function resetDiscoverySection(
  accountId: string,
  section: DiscoverySection,
): DiscoverySettings {
  return getDb().transaction(() => {
    const document = readDocument(accountId);
    delete document[section];
    return store(accountId, section, Object.keys(document).length > 0 ? document : null);
  });
}
