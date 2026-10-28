import { z } from 'zod';
import { parseInput } from './validate';
import { DEFAULT_SPEND_CAPS, SpendCapsInput, X_HOME_TIMELINE_MAX_PAGES } from './x-api';

// Reply discovery: the topics to match, who to watch, the thresholds that score a post and the
// filters that drop it. Settings edits them one section at a time and a run reads all of them.
// Shared by the Settings page and the server (and, later, the REST API and the MCP tools): no
// server imports.

export const MAX_NICHE_KEYWORDS = 50;
export const MAX_WATCH_HANDLES = 100;
export const MAX_EXCLUSION_KEYWORDS = 50;
export const MAX_KEYWORD_LENGTH = 60;

/** X usernames: up to 15 letters, digits or underscores. */
const HANDLE = /^[a-z0-9_]{1,15}$/;

/** A handle as XBase stores it: trimmed, without the @, lower case. */
const normalizeHandle = (handle: string) => handle.trim().replace(/^@+/, '').toLowerCase();

/** Whether X would accept `handle` as a username. */
export const isHandle = (handle: string) => HANDLE.test(normalizeHandle(handle));

/** Pasted text as keywords: one per line or comma, trimmed, blanks dropped. */
export const parseKeywords = (text: string): string[] =>
  text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Pasted text as handles: spaces separate them too, since a handle can't contain one. */
export const parseHandles = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map(normalizeHandle)
    .filter(Boolean);

/** Drops repeats, ignoring case: the first spelling wins. */
const dedupe = (entries: string[]): string[] =>
  entries.filter(
    (entry, index) =>
      entries.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) === index,
  );

const Keyword = z
  .string()
  .trim()
  .min(1, 'Enter a word or phrase')
  .max(MAX_KEYWORD_LENGTH, `A keyword can have at most ${MAX_KEYWORD_LENGTH} characters`);

// A blank entry — a pasted "a,,b", or an empty line — is no keyword rather than a mistake.
const blankless = (entries: string[]) => entries.map((entry) => entry.trim()).filter(Boolean);

const keywordList = (max: number) =>
  z
    .array(z.string())
    .transform(blankless)
    .pipe(z.array(Keyword).transform(dedupe))
    .refine((keywords) => keywords.length <= max, `A list holds at most ${max} keywords`);

const Handle = z
  .string()
  .transform(normalizeHandle)
  .pipe(z.string().regex(HANDLE, 'Use an X handle, like @mastro993'));

const handleList = (max: number) =>
  z
    .array(z.string())
    .transform((entries) => entries.map(normalizeHandle).filter(Boolean))
    .pipe(z.array(Handle).transform(dedupe))
    .refine((handles) => handles.length <= max, `A list holds at most ${max} handles`);

/** The topics the owner posts about: used to match posts and to build search queries. */
const DiscoveryNichesInput = z.object({
  /** Posts outside these words are dropped, unless the list is empty. */
  keywords: keywordList(MAX_NICHE_KEYWORDS),
});

/** Who to look at first, and who never to suggest. */
const DiscoveryWatchInput = z.object({
  /** Accounts whose new posts get a score boost. */
  accounts: handleList(MAX_WATCH_HANDLES),
  /** Accounts never to suggest, whatever they post. */
  blocked: handleList(MAX_WATCH_HANDLES),
});

/**
 * What each threshold is called and what it accepts: the schema's messages and the page's fields
 * both read it, so a range error names the box it came from.
 */
export const DISCOVERY_THRESHOLDS = {
  minAuthorFollowers: { label: 'Minimum author followers', min: 0, max: 10_000_000 },
  bestAgeHours: { label: 'Best post age (hours)', min: 1, max: 72 },
  hardMaxAgeHours: { label: 'Hard age cap (hours)', min: 1, max: 168 },
  idealReplies: { label: 'Ideal replies', min: 0, max: 500 },
  crowdedFrom: { label: 'Crowded from (replies)', min: 1, max: 500 },
  hardReplyCap: { label: 'Hard reply cap (replies)', min: 1, max: 1000 },
  authorCooldownDays: { label: 'Author cooldown (days)', min: 0, max: 90 },
  maxPostsPerAuthor: { label: 'Posts per author, per batch', min: 1, max: 3 },
  maxPostsPerBatch: { label: 'Posts per batch', min: 5, max: 30 },
} as const;

export type DiscoveryThreshold = keyof typeof DISCOVERY_THRESHOLDS;

const threshold = (field: DiscoveryThreshold) => {
  const { label, min, max } = DISCOVERY_THRESHOLDS[field];
  return z
    .number()
    .int(`${label}: use a whole number`)
    .min(min, `${label}: use ${min} or more`)
    .max(max, `${label}: use ${max.toLocaleString('en-US')} or less`);
};

/** What makes a post a good pick. The rules between them are checked here, not in the page. */
const DiscoveryThresholdsInput = z
  .object({
    minAuthorFollowers: threshold('minAuthorFollowers'),
    bestAgeHours: threshold('bestAgeHours'),
    hardMaxAgeHours: threshold('hardMaxAgeHours'),
    idealReplies: threshold('idealReplies'),
    crowdedFrom: threshold('crowdedFrom'),
    hardReplyCap: threshold('hardReplyCap'),
    authorCooldownDays: threshold('authorCooldownDays'),
    maxPostsPerAuthor: threshold('maxPostsPerAuthor'),
    maxPostsPerBatch: threshold('maxPostsPerBatch'),
  })
  .superRefine((thresholds, ctx) => {
    if (thresholds.hardMaxAgeHours < thresholds.bestAgeHours) {
      ctx.addIssue({
        code: 'custom',
        path: ['hardMaxAgeHours'],
        message: 'The hard age cap must be at least the best age',
      });
    }
    // A penalty that starts at the ideal value would punish every post that has one.
    if (thresholds.crowdedFrom <= thresholds.idealReplies) {
      ctx.addIssue({
        code: 'custom',
        path: ['crowdedFrom'],
        message: 'The crowded penalty must start above the ideal number of replies',
      });
    }
    if (thresholds.hardReplyCap < thresholds.crowdedFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['hardReplyCap'],
        message: 'The hard reply cap must be at least where the crowded penalty starts',
      });
    }
  });

/**
 * What each keyword switch drops until the owner edits its list. Matching ignores case, styled
 * letters and the separators inside a phrase ("pre-sale" also finds "presale"), and adds a plain
 * plural; so each entry here is chosen not to hit ordinary developer and indie posts ("crypto"
 * would catch node:crypto, "win a" a hackathon). An account that saved the section keeps its own.
 */
export const DEFAULT_EXCLUSION_KEYWORDS = {
  bait: [
    'like if you agree',
    'like this if',
    'like and repost',
    'like and retweet',
    'retweet if',
    'repost if',
    'rt if',
    'comment if',
    'comment below',
    'tag a friend',
    'tag your friend',
    'follow for follow',
    'f4f',
    'follow back',
    'who agrees',
    "i'll dm you",
    'share if',
  ],
  giveaways: [
    'giveaway',
    'enter to win',
    'chance to win',
    'rt to win',
    'retweet to win',
    'follow to win',
    'reply to win',
    'gift card',
  ],
  promos: [
    'promo code',
    'discount code',
    'use my code',
    '% off',
    'limited time offer',
    'buy now',
    'link in bio',
    '#ad',
    '#sponsored',
    'paid partnership',
  ],
  politics: [
    'election',
    'president',
    'senator',
    'congress',
    'ballot',
    'campaign trail',
    'democrat',
    'republican',
    'midterm',
  ],
  crypto: [
    'airdrop',
    'pre-sale',
    'alt coin',
    'meme coin',
    'defi',
    'nft',
    'bitcoin',
    '$btc',
    'ethereum',
    '$eth',
    'web3',
    'pump and dump',
    'to the moon',
    'rug pull',
  ],
} as const;

/** The switches that filter on keywords, rather than on a post's shape. */
export type ExclusionFilter = keyof typeof DEFAULT_EXCLUSION_KEYWORDS;

const KeywordExclusion = z.object({
  enabled: z.boolean(),
  keywords: keywordList(MAX_EXCLUSION_KEYWORDS),
});

/**
 * The longest thread an opener may announce ("1/12 🧵") before the long-threads switch drops it.
 * The range may only ever widen: a stored value outside it resets the whole section.
 */
export const MAX_THREAD_POSTS = { label: 'Longest thread (posts)', min: 2, max: 50 } as const;

/** What to keep out of a batch: five keyword lists, and two shapes of post. */
const DiscoveryExclusionsInput = z.object({
  bait: KeywordExclusion,
  giveaways: KeywordExclusion,
  promos: KeywordExclusion,
  politics: KeywordExclusion,
  crypto: KeywordExclusion,
  /** Posts that are only an image: nothing to reply to. */
  imageOnly: z.boolean(),
  /** Thread openers announcing more than `maxThreadPosts` parts: a reply lands under them all. */
  longThreads: z.boolean(),
  maxThreadPosts: z
    .number()
    .int(`${MAX_THREAD_POSTS.label}: use a whole number`)
    .min(MAX_THREAD_POSTS.min, `${MAX_THREAD_POSTS.label}: use ${MAX_THREAD_POSTS.min} or more`)
    .max(MAX_THREAD_POSTS.max, `${MAX_THREAD_POSTS.label}: use ${MAX_THREAD_POSTS.max} or less`),
});

/** The languages XBase can look for posts in and write replies in: X's `lang:` takes these codes. */
export const DISCOVERY_LANGUAGES = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pl: 'Polish',
  pt: 'Portuguese',
  ru: 'Russian',
  sv: 'Swedish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  zh: 'Chinese',
} as const;

export type DiscoveryLanguageCode = keyof typeof DISCOVERY_LANGUAGES;
/** The codes as z.enum wants them: a non-empty tuple of literals. */
const LANGUAGE_CODES = Object.keys(DISCOVERY_LANGUAGES) as [
  DiscoveryLanguageCode,
  ...DiscoveryLanguageCode[],
];

/** Which posts to look for, and which language the replies are written in. */
const DiscoveryLanguageInput = z.object({
  posts: z.enum(LANGUAGE_CODES, 'Pick a language'),
  replies: z.enum(LANGUAGE_CODES, 'Pick a language'),
});

/** What a run reads, and how many paid pages of it. */
const DiscoverySourcesInput = z.object({
  /** Pages of the home timeline one run fetches; each page is a paid call of up to 25 posts. */
  homeTimelinePages: z
    .number()
    .int('Use a whole number')
    .min(1, 'Fetch at least one page')
    .max(X_HOME_TIMELINE_MAX_PAGES, `Fetch at most ${X_HOME_TIMELINE_MAX_PAGES} pages`),
});

/** This account's share of the X API budget; the workspace caps in Settings → X API are the hard limit. */
const DiscoveryBudgetInput = SpendCapsInput;

/** The sections Settings shows, in the order it shows them, and saves them one at a time. */
export const DISCOVERY_SECTIONS = [
  'niches',
  'watch',
  'thresholds',
  'exclusions',
  'language',
  'sources',
  'budget',
] as const;
export type DiscoverySection = (typeof DISCOVERY_SECTIONS)[number];

const DISCOVERY_SECTION_SCHEMAS = {
  niches: DiscoveryNichesInput,
  watch: DiscoveryWatchInput,
  thresholds: DiscoveryThresholdsInput,
  exclusions: DiscoveryExclusionsInput,
  language: DiscoveryLanguageInput,
  sources: DiscoverySourcesInput,
  budget: DiscoveryBudgetInput,
} as const satisfies Record<DiscoverySection, z.ZodType>;

/** Every setting, section by section: what a run reads. */
export type DiscoverySettings = {
  [S in DiscoverySection]: z.infer<(typeof DISCOVERY_SECTION_SCHEMAS)[S]>;
};

/** What a fresh account gets: a sensible batch, and the usual junk filtered out. */
export const DEFAULT_DISCOVERY_SETTINGS: DiscoverySettings = {
  niches: { keywords: [] },
  watch: { accounts: [], blocked: [] },
  thresholds: {
    minAuthorFollowers: 5_000,
    bestAgeHours: 6,
    hardMaxAgeHours: 24,
    idealReplies: 20,
    crowdedFrom: 40,
    hardReplyCap: 60,
    authorCooldownDays: 3,
    maxPostsPerAuthor: 1,
    maxPostsPerBatch: 15,
  },
  exclusions: {
    bait: { enabled: true, keywords: [...DEFAULT_EXCLUSION_KEYWORDS.bait] },
    giveaways: { enabled: true, keywords: [...DEFAULT_EXCLUSION_KEYWORDS.giveaways] },
    promos: { enabled: true, keywords: [...DEFAULT_EXCLUSION_KEYWORDS.promos] },
    politics: { enabled: true, keywords: [...DEFAULT_EXCLUSION_KEYWORDS.politics] },
    crypto: { enabled: true, keywords: [...DEFAULT_EXCLUSION_KEYWORDS.crypto] },
    imageOnly: true,
    longThreads: true,
    maxThreadPosts: 8,
  },
  language: { posts: 'en', replies: 'en' },
  sources: { homeTimelinePages: 1 },
  budget: { ...DEFAULT_SPEND_CAPS },
};

/** One section, normalised and validated: for the server, and the REST API and MCP tools later. */
export function parseDiscoverySection<S extends DiscoverySection>(
  section: S,
  value: unknown,
): DiscoverySettings[S] {
  // Each schema parses to exactly its section's value, which TypeScript can't see through a
  // union indexed by a generic.
  return parseInput(DISCOVERY_SECTION_SCHEMAS[section], value) as DiscoverySettings[S];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One stored section over its defaults: a value saved by an older version keeps what it has and
 * gains whichever fields were added since. A section that no longer reads falls back to its
 * defaults, rather than losing the sections around it.
 */
function readSection<S extends DiscoverySection>(
  document: Record<string, unknown>,
  section: S,
): DiscoverySettings[S] {
  const stored = document[section];
  const merged = isRecord(stored)
    ? { ...DEFAULT_DISCOVERY_SETTINGS[section], ...stored }
    : DEFAULT_DISCOVERY_SETTINGS[section];
  const parsed = DISCOVERY_SECTION_SCHEMAS[section].safeParse(merged);
  return parsed.success
    ? (parsed.data as DiscoverySettings[S])
    : DEFAULT_DISCOVERY_SETTINGS[section];
}

/** What the account stored, over the defaults: null or unreadable JSON means "never saved". */
export function readDiscoverySettings(stored: unknown): DiscoverySettings {
  const document = isRecord(stored) ? stored : {};
  return {
    niches: readSection(document, 'niches'),
    watch: readSection(document, 'watch'),
    thresholds: readSection(document, 'thresholds'),
    exclusions: readSection(document, 'exclusions'),
    language: readSection(document, 'language'),
    sources: readSection(document, 'sources'),
    budget: readSection(document, 'budget'),
  };
}

/**
 * One section as the Settings page saves it: its name and the value, which the section's own
 * schema checks — so a REST or MCP caller can post a section without a schema of its own.
 */
export const SaveDiscoverySectionInput = z.object({
  section: z.enum(DISCOVERY_SECTIONS, 'Pick a section'),
  value: z.unknown(),
});

/** Which section to reset to its defaults. */
export const DiscoverySectionInput = z.object({
  section: z.enum(DISCOVERY_SECTIONS, 'Pick a section'),
});
