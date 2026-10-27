import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVERY_SETTINGS,
  DEFAULT_EXCLUSION_KEYWORDS,
  DISCOVERY_SECTIONS,
  parseDiscoverySection,
  parseHandles,
  parseKeywords,
  readDiscoverySettings,
  SaveDiscoverySectionInput,
} from '../discovery';
import { ValidationError } from '../errors';

const messages = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.message;
    throw error;
  }
  throw new Error('Expected a ValidationError');
};

const thresholds = (changes: Record<string, number> = {}) => ({
  ...DEFAULT_DISCOVERY_SETTINGS.thresholds,
  ...changes,
});

describe('defaults', () => {
  it('are what an account that never saved anything gets', () => {
    expect(readDiscoverySettings(null)).toEqual(DEFAULT_DISCOVERY_SETTINGS);
    expect(readDiscoverySettings('not a document')).toEqual(DEFAULT_DISCOVERY_SETTINGS);
    expect(readDiscoverySettings([1, 2])).toEqual(DEFAULT_DISCOVERY_SETTINGS);
  });

  it('pass every section’s rules unchanged, so saving one keeps its defaults', () => {
    for (const section of DISCOVERY_SECTIONS) {
      expect(parseDiscoverySection(section, DEFAULT_DISCOVERY_SETTINGS[section])).toEqual(
        DEFAULT_DISCOVERY_SETTINGS[section],
      );
    }
  });

  it('ship keyword lists for every switch that has one, within the length limit', () => {
    for (const keywords of Object.values(DEFAULT_EXCLUSION_KEYWORDS)) {
      expect(keywords.length).toBeGreaterThan(0);
      expect(new Set(keywords).size).toBe(keywords.length);
    }
  });
});

describe('readDiscoverySettings', () => {
  it('overlays what was stored over the defaults, section by section', () => {
    const settings = readDiscoverySettings({
      thresholds: { bestAgeHours: 2, maxPostsPerBatch: 20 },
      niches: { keywords: ['indie hacking'] },
    });
    expect(settings.thresholds).toEqual({
      ...thresholds({ bestAgeHours: 2, maxPostsPerBatch: 20 }),
    });
    expect(settings.niches.keywords).toEqual(['indie hacking']);
    expect(settings.language).toEqual(DEFAULT_DISCOVERY_SETTINGS.language);
  });

  it('falls back to one section’s defaults when only it no longer reads', () => {
    const settings = readDiscoverySettings({
      thresholds: { bestAgeHours: 9, hardMaxAgeHours: 2 },
      language: { posts: 'it', replies: 'it' },
    });
    expect(settings.thresholds).toEqual(DEFAULT_DISCOVERY_SETTINGS.thresholds);
    expect(settings.language).toEqual({ posts: 'it', replies: 'it' });
  });

  it('normalises what an older version stored', () => {
    const settings = readDiscoverySettings({ watch: { accounts: ['@IndieHacker'] } });
    expect(settings.watch).toEqual({ accounts: ['indiehacker'], blocked: [] });
  });
});

describe('thresholds', () => {
  it.each([
    ['hardMaxAgeHours', { hardMaxAgeHours: 3, bestAgeHours: 6 }, 'hard age cap'],
    ['crowdedFrom', { idealReplies: 20, crowdedFrom: 20 }, 'crowded penalty'],
    ['hardReplyCap', { crowdedFrom: 40, hardReplyCap: 30 }, 'hard reply cap'],
  ])('reject a %s that breaks the rule between them', (field, changes, message) => {
    const error = messages(() => parseDiscoverySection('thresholds', thresholds(changes)));
    expect(error).toContain(message);
    expect(error).toContain(`at ${field}`);
  });

  it('accept a crowded penalty exactly at the hard reply cap', () => {
    const saved = parseDiscoverySection(
      'thresholds',
      thresholds({ idealReplies: 10, crowdedFrom: 20, hardReplyCap: 20 }),
    );
    expect(saved.crowdedFrom).toBe(20);
  });

  it('stay within their limits, and say which', () => {
    // A batch is 5 to 30 posts: the range the batch runner shares.
    expect(
      messages(() => parseDiscoverySection('thresholds', thresholds({ maxPostsPerBatch: 31 }))),
    ).toContain('Use 30 or less');
    expect(
      messages(() => parseDiscoverySection('thresholds', thresholds({ maxPostsPerBatch: 4 }))),
    ).toContain('Use 5 or more');
    expect(
      messages(() => parseDiscoverySection('thresholds', thresholds({ bestAgeHours: 2.5 }))),
    ).toContain('whole number');
  });
});

describe('niches and watch lists', () => {
  it('trim keywords, drop blanks and repeats, and keep the first spelling', () => {
    const saved = parseDiscoverySection('niches', {
      keywords: ['  Indie hacking ', '', 'indie HACKING', 'build in public'],
    });
    expect(saved.keywords).toEqual(['Indie hacking', 'build in public']);
  });

  it('store handles without the @, in lower case, once', () => {
    const saved = parseDiscoverySection('watch', {
      accounts: ['@Mastro993', 'mastro993 ', '@xbase'],
      blocked: [],
    });
    expect(saved.accounts).toEqual(['mastro993', 'xbase']);
  });

  it('reject an entry X wouldn’t take as a handle, and say which', () => {
    expect(
      messages(() =>
        parseDiscoverySection('watch', { accounts: ['mastro993', 'a name'], blocked: [] }),
      ),
    ).toMatch(/Use an X handle[\s\S]*accounts\[1\]/);
  });

  it('cap each list', () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => `user${index}`);
    expect(
      messages(() => parseDiscoverySection('watch', { accounts: tooMany, blocked: [] })),
    ).toContain('at most 100 handles');
  });

  it('split pasted text on commas, lines and — for handles — spaces', () => {
    expect(parseKeywords('indie hacking, build in public\nship small ')).toEqual([
      'indie hacking',
      'build in public',
      'ship small',
    ]);
    expect(parseHandles('@mastro993, xbase\nindie_hacker')).toEqual([
      'mastro993',
      'xbase',
      'indie_hacker',
    ]);
  });
});

describe('exclusions and language', () => {
  it('turn a switch off without losing its keywords', () => {
    const saved = parseDiscoverySection('exclusions', {
      ...DEFAULT_DISCOVERY_SETTINGS.exclusions,
      crypto: { enabled: false, keywords: ['airdrop', 'NFT'] },
    });
    expect(saved.crypto).toEqual({ enabled: false, keywords: ['airdrop', 'NFT'] });
    expect(saved.politics.enabled).toBe(true);
  });

  it('take only languages XBase offers', () => {
    expect(parseDiscoverySection('language', { posts: 'it', replies: 'en' })).toEqual({
      posts: 'it',
      replies: 'en',
    });
    expect(() => parseDiscoverySection('language', { posts: 'xx', replies: 'en' })).toThrow(
      /Pick a language/,
    );
  });
});

describe('SaveDiscoverySectionInput', () => {
  it('checks the section name, and leaves its value to that section', () => {
    expect(
      SaveDiscoverySectionInput.safeParse({ section: 'language', value: { posts: 'en' } }).success,
    ).toBe(true);
    expect(SaveDiscoverySectionInput.safeParse({ section: 'nope', value: {} }).success).toBe(false);
    expect(() => parseDiscoverySection('language', { posts: 'en' })).toThrow(ValidationError);
  });
});
