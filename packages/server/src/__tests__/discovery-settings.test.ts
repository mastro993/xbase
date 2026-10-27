import { DEFAULT_DISCOVERY_SETTINGS } from '@xbase/core/discovery';
import { NotFoundError, ValidationError } from '@xbase/core/errors';
import { xAccounts } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDiscoverySettings,
  resetDiscoverySection,
  saveDiscoverySettings,
} from '../discovery-settings';

let db: ReturnType<typeof createTestDb>;
let accountId: string;
beforeEach(() => {
  db = createTestDb();
  accountId = seedAccount();
});

const stored = (id = accountId) =>
  db.select({ discovery: xAccounts.discovery }).from(xAccounts).where(eq(xAccounts.id, id)).get()
    ?.discovery;

describe('getDiscoverySettings', () => {
  it('gives a fresh account the defaults, without writing anything', () => {
    expect(getDiscoverySettings(accountId)).toEqual(DEFAULT_DISCOVERY_SETTINGS);
    expect(stored()).toBeNull();
  });

  it('names the account it can’t find', () => {
    expect(() => getDiscoverySettings('nobody')).toThrow(NotFoundError);
  });

  it('reads a section saved by an older version with the fields added since', () => {
    db.update(xAccounts)
      .set({ discovery: { thresholds: { bestAgeHours: 2 } } })
      .where(eq(xAccounts.id, accountId))
      .run();
    expect(getDiscoverySettings(accountId).thresholds).toEqual({
      ...DEFAULT_DISCOVERY_SETTINGS.thresholds,
      bestAgeHours: 2,
    });
  });
});

describe('saveDiscoverySettings', () => {
  it('saves one section, normalised, and returns every setting', () => {
    const settings = saveDiscoverySettings(accountId, 'watch', {
      accounts: ['@IndieHacker', 'mastro993'],
      blocked: [],
    });
    expect(settings.watch).toEqual({ accounts: ['indiehacker', 'mastro993'], blocked: [] });
    expect(settings.thresholds).toEqual(DEFAULT_DISCOVERY_SETTINGS.thresholds);
    expect(getDiscoverySettings(accountId).watch).toEqual(settings.watch);
  });

  it('keeps the sections saved before it', () => {
    saveDiscoverySettings(accountId, 'niches', { keywords: ['indie hacking'] });
    saveDiscoverySettings(accountId, 'language', { posts: 'it', replies: 'it' });
    expect(getDiscoverySettings(accountId).niches.keywords).toEqual(['indie hacking']);
    expect(getDiscoverySettings(accountId).language).toEqual({ posts: 'it', replies: 'it' });
  });

  it('stores only the sections it saved, so new defaults still reach the others', () => {
    saveDiscoverySettings(accountId, 'niches', { keywords: [] });
    expect(stored()).toEqual({ niches: { keywords: [] } });
  });

  it('rejects a section that breaks its rules, and stores nothing', () => {
    expect(() =>
      saveDiscoverySettings(accountId, 'thresholds', {
        ...DEFAULT_DISCOVERY_SETTINGS.thresholds,
        bestAgeHours: 12,
        hardMaxAgeHours: 6,
      }),
    ).toThrow(ValidationError);
    expect(stored()).toBeNull();
  });

  it('keeps each account’s settings to itself', () => {
    const other = seedAccount({ id: '2002' });
    saveDiscoverySettings(accountId, 'niches', { keywords: ['indie hacking'] });
    expect(getDiscoverySettings(other)).toEqual(DEFAULT_DISCOVERY_SETTINGS);
    expect(getDiscoverySettings(other).niches.keywords).toEqual([]);
  });

  it('keeps the spend caps and the page count with the account that set them', () => {
    saveDiscoverySettings(accountId, 'budget', { dailyCapUsd: 0.5, monthlyCapUsd: null });
    saveDiscoverySettings(accountId, 'sources', { homeTimelinePages: 3 });

    expect(getDiscoverySettings(accountId).budget).toEqual({
      dailyCapUsd: 0.5,
      monthlyCapUsd: null,
    });
    expect(getDiscoverySettings(accountId).sources).toEqual({ homeTimelinePages: 3 });

    const other = seedAccount({ id: '2002' });
    expect(getDiscoverySettings(other).budget.dailyCapUsd).toBeNull();
    expect(getDiscoverySettings(other).sources.homeTimelinePages).toBe(1);
  });
});

describe('resetDiscoverySection', () => {
  it('restores one section and leaves the others saved', () => {
    saveDiscoverySettings(accountId, 'niches', { keywords: ['indie hacking'] });
    saveDiscoverySettings(accountId, 'language', { posts: 'it', replies: 'it' });

    const settings = resetDiscoverySection(accountId, 'language');
    expect(settings.language).toEqual(DEFAULT_DISCOVERY_SETTINGS.language);
    expect(settings.niches.keywords).toEqual(['indie hacking']);
    expect(stored()).toEqual({ niches: { keywords: ['indie hacking'] } });
  });

  it('empties the column once no section is saved', () => {
    saveDiscoverySettings(accountId, 'niches', { keywords: ['indie hacking'] });
    expect(resetDiscoverySection(accountId, 'niches')).toEqual(DEFAULT_DISCOVERY_SETTINGS);
    expect(stored()).toBeNull();
  });

  it('is fine for a section that was never saved', () => {
    expect(resetDiscoverySection(accountId, 'watch')).toEqual(DEFAULT_DISCOVERY_SETTINGS);
  });
});
