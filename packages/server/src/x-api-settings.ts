import { parseInput } from '@xbase/core/validate';
import {
  parseXApiSection,
  readXApiSettings,
  SaveXApiSettingsInput,
  type XApiSection,
  type XApiSettings,
} from '@xbase/core/x-api';
import { getDb } from '@xbase/db/client';
import { settings } from '@xbase/db/schema';
import { eq } from 'drizzle-orm';

// X API settings: the workspace's hard spend caps and the cache window. They live in the generic
// settings table, next to the AI choice; each account's own caps and home timeline page count
// live in that account's discovery document (discovery-settings.ts).

const KEY = 'x-api';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readDocument(): Record<string, unknown> {
  const row = getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, KEY))
    .get();
  return isRecord(row?.value) ? row.value : {};
}

function writeDocument(document: Record<string, unknown>): void {
  getDb()
    .insert(settings)
    .values({ key: KEY, value: document })
    .onConflictDoUpdate({ target: settings.key, set: { value: document, updatedAt: new Date() } })
    .run();
}

/** Every setting, the saved sections over the defaults, so a missing field never breaks a read. */
export function getXApiSettings(): XApiSettings {
  return readXApiSettings(readDocument());
}

/** Saves every section the Settings form shows and returns what was stored. */
export function saveXApiSettings(value: unknown): XApiSettings {
  const saved = parseInput(SaveXApiSettingsInput, value);
  writeDocument(saved);
  return readXApiSettings(saved);
}

/**
 * Saves one section, normalised, keeping the others: the shape discovery settings uses, for a
 * caller that only changes the caps or the cache window.
 */
export function saveXApiSection(section: XApiSection, value: unknown): XApiSettings {
  const document = readDocument();
  const saved = { ...document, [section]: parseXApiSection(section, value) };
  writeDocument(saved);
  return readXApiSettings(saved);
}
