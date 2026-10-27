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

// Reply discovery's settings, in one JSON column per X account. Settings saves them a section at
// a time; a discovery run reads them all at its start, which is how a change applies to the next
// run. The REST API and the MCP tools can call these too.

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
  const document = readDocument(accountId);
  const saved = { ...document, [section]: parseDiscoverySection(section, value) };
  writeDocument(accountId, saved);
  return readDiscoverySettings(saved);
}

/** Forgets one section's saved value, so it reads as its defaults again; the others stay. */
export function resetDiscoverySection(
  accountId: string,
  section: DiscoverySection,
): DiscoverySettings {
  const document = readDocument(accountId);
  delete document[section];
  const restored = Object.keys(document).length > 0 ? document : null;
  writeDocument(accountId, restored);
  return readDiscoverySettings(restored);
}
