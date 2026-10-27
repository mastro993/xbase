import { z } from 'zod';
import { parseInput } from './validate';

// Reading X: the price table, the limits of the tier in use, and the settings that cap spending
// and decide how fresh cached posts may be. Every feature reads through @xbase/server/x-api-client;
// this module is what both sides of that layer agree on. No server imports.

/**
 * What X charges for a read, in micro-dollars (1 µUSD = $0.000001), so costs add up exactly.
 * As of October 2026, X's pay-per-use API charges $0.005 per post read by others and $0.001 per
 * own post or follower read. X does not return a price with a response: XBase estimates it.
 */
export const X_READ_PRICE_MICROS = {
  own: 1_000,
  other: 5_000,
} as const;

/** Which feature asked for a read; written to the usage log and shown in Settings. */
export const X_API_FEATURES = ['discovery', 'full_text', 'performance', 'profile'] as const;
export type XApiFeature = (typeof X_API_FEATURES)[number];

/** The outcome of a call to X, as the usage log keeps it. */
export const X_API_CALL_STATUSES = ['ok', 'error', 'rate_limited'] as const;
export type XApiCallStatus = (typeof X_API_CALL_STATUSES)[number];

/** Recent search in this tier returns at most 25 posts per call. */
export const X_SEARCH_RESULTS_PER_CALL = 25;
/** /2/tweets accepts at most 100 ids per call. */
export const X_POSTS_PER_CALL = 100;
/** A home-timeline run fetches one page unless the owner raises it; ten is the ceiling. */
export const X_HOME_TIMELINE_MAX_PAGES = 10;

/** The estimated cost of `items` reads, own ones at $0.001 and others at $0.005. */
export function estimateReadCostMicros({
  otherItems = 0,
  ownItems = 0,
}: {
  otherItems?: number;
  ownItems?: number;
}): number {
  return (
    Math.max(0, Math.trunc(ownItems)) * X_READ_PRICE_MICROS.own +
    Math.max(0, Math.trunc(otherItems)) * X_READ_PRICE_MICROS.other
  );
}

/**
 * What one more home-timeline page can cost: 25 posts by others. X may return fewer, which is
 * cheap; the estimate is the ceiling the owner sees before raising the page count.
 */
export const estimateHomeTimelinePageMicros = () =>
  estimateReadCostMicros({ otherItems: X_SEARCH_RESULTS_PER_CALL });

/** The ceiling for a whole run, before any cache hit brings it down. */
export const estimateHomeTimelineCostMicros = (pages: number) =>
  Math.max(0, Math.trunc(pages)) * estimateHomeTimelinePageMicros();

export const usdToMicros = (usd: number): number => Math.round(usd * 1_000_000);
export const microsToUsd = (micros: number): number => micros / 1_000_000;

/** "$0.12", "$1.25", "$0.005": enough decimals to see a single cheap read. */
export function formatUsdMicros(micros: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(microsToUsd(micros));
}

const CapUsd = z
  .number()
  .min(0, 'Use zero or more')
  .max(1_000_000, 'That cap is too high')
  .nullable();

/**
 * A daily and a monthly cap, in dollars. The workspace sets one pair in `x-api` settings, the hard
 * limit every account shares; each account can set a lower pair of its own under `discovery`.
 * A null cap means the owner set none, so paid reads then only stop at the limit above it.
 */
export const SpendCapsInput = z.object({
  dailyCapUsd: CapUsd,
  monthlyCapUsd: CapUsd,
});
export type SpendCaps = z.infer<typeof SpendCapsInput>;

/** A scope that never set a cap pays whatever X charges. */
export const DEFAULT_SPEND_CAPS: SpendCaps = { dailyCapUsd: null, monthlyCapUsd: null };

/** The sections of the workspace's X API settings; a new field never needs a migration. */
export const X_API_SECTIONS = ['budget', 'cache'] as const;
export type XApiSection = (typeof X_API_SECTIONS)[number];

const CacheInput = z.object({
  /** A post fetched this recently is served from the database instead of X. Zero disables it. */
  windowMinutes: z
    .number()
    .int('Use whole minutes')
    .min(0, 'Use zero or more')
    .max(7 * 24 * 60, 'Keep posts for at most a week'),
});

const X_API_SECTION_SCHEMAS = {
  budget: SpendCapsInput,
  cache: CacheInput,
} as const satisfies Record<XApiSection, z.ZodType>;

/** The workspace's X API settings: the hard spend caps and the cache window. */
export type XApiSettings = {
  [S in XApiSection]: z.infer<(typeof X_API_SECTION_SCHEMAS)[S]>;
};

/** A fresh install pays no cap until the owner sets one, and caches posts for an hour. */
export const DEFAULT_X_API_SETTINGS: XApiSettings = {
  budget: { ...DEFAULT_SPEND_CAPS },
  cache: { windowMinutes: 60 },
};

/** One section, normalised and validated; the server and later the REST and MCP tools use it. */
export function parseXApiSection<S extends XApiSection>(
  section: S,
  value: unknown,
): XApiSettings[S] {
  // Each schema parses to exactly its section's value, which TypeScript can't see through a
  // union indexed by a generic.
  return parseInput(X_API_SECTION_SCHEMAS[section], value) as XApiSettings[S];
}

/** Every section at once, as the Settings form saves it. */
export const SaveXApiSettingsInput = z.object({
  budget: SpendCapsInput,
  cache: CacheInput,
});

/** One section, as a caller that only changes the caps saves it. */
export const SaveXApiSectionInput = z.object({
  section: z.enum(X_API_SECTIONS, 'Pick a section'),
  value: z.unknown(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One stored section over its defaults: a value saved by an older version keeps what it has and
 * gains whichever fields were added since. A section that no longer reads falls back to its
 * defaults, rather than losing the sections around it.
 */
function readSection<S extends XApiSection>(
  document: Record<string, unknown>,
  section: S,
): XApiSettings[S] {
  const stored = document[section];
  const merged = isRecord(stored)
    ? { ...DEFAULT_X_API_SETTINGS[section], ...stored }
    : DEFAULT_X_API_SETTINGS[section];
  const parsed = X_API_SECTION_SCHEMAS[section].safeParse(merged);
  return parsed.success ? (parsed.data as XApiSettings[S]) : DEFAULT_X_API_SETTINGS[section];
}

/** What was stored, over the defaults: null or unreadable JSON means "never saved". */
export function readXApiSettings(stored: unknown): XApiSettings {
  const document = isRecord(stored) ? stored : {};
  return {
    budget: readSection(document, 'budget'),
    cache: readSection(document, 'cache'),
  };
}

/** Spend so far in the current UTC day, week and month. */
export type SpendDto = {
  todayMicros: number;
  weekMicros: number;
  monthMicros: number;
};

/** The rate-limit headers of one endpoint, as X last reported them. */
export type XRateLimitDto = {
  endpoint: string;
  limit: number | null;
  remaining: number | null;
  /** When the short window (usually 15 minutes) resets. */
  resetAt: string | null;
  /** X's per-user 24-hour window, when the endpoint reports one. */
  dayLimit: number | null;
  dayRemaining: number | null;
  dayResetAt: string | null;
  updatedAt: string;
};

/** One row of the usage log. */
export type XApiCallDto = {
  id: string;
  accountId: string;
  username: string;
  endpoint: string;
  feature: XApiFeature;
  itemCount: number;
  costMicros: number;
  status: XApiCallStatus;
  error: string | null;
  createdAt: string;
};

/** One account's spend, its own caps and its rate limits; the workspace caps are shown outside. */
export type XApiAccountUsageDto = {
  id: string;
  username: string;
  spend: SpendDto;
  /** This account's own caps, inside the workspace's hard limit. */
  caps: { daily: SpendCapDto; monthly: SpendCapDto };
  rateLimits: XRateLimitDto[];
};

/** A spend cap and where it stands: the UI shows its reset time only once it is reached. */
export type SpendCapDto = {
  limitMicros: number | null;
  spentMicros: number;
  resetAt: string;
  reached: boolean;
};

export type XApiUsageDto = {
  generatedAt: string;
  accounts: XApiAccountUsageDto[];
  spend: SpendDto;
  /** The workspace's hard caps, over every account together. */
  caps: { daily: SpendCapDto; monthly: SpendCapDto };
  settings: XApiSettings;
  /** The most results one search call returns in this tier. */
  resultsPerCall: number;
  /** The newest calls, one row each. */
  calls: XApiCallDto[];
};
