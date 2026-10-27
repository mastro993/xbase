import { BudgetExceededError, type BudgetScope } from '@xbase/core/errors';
import {
  type SpendCapDto,
  type SpendCaps,
  type SpendDto,
  type XApiAccountUsageDto,
  type XApiCallDto,
  type XApiUsageDto,
  type XRateLimitDto,
  usdToMicros,
  X_SEARCH_RESULTS_PER_CALL,
} from '@xbase/core/x-api';
import { getDb } from '@xbase/db/client';
import { type XApiCall, xAccounts, xApiCalls, xRateLimits } from '@xbase/db/schema';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { listAccounts } from './accounts';
import { getDiscoverySettings } from './discovery-settings';
import { getXApiSettings } from './x-api-settings';

// X API usage: the log of paid reads, the spend caps that stop them, and the rate-limit windows
// X reported. Day, week and month boundaries are UTC, because that is how X bills.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of `now`'s day. */
export const startOfUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Monday, 00:00 UTC of `now`'s week. */
export const startOfUtcWeek = (now: Date): Date => {
  const day = startOfUtcDay(now);
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
};

/** The first day of `now`'s month, 00:00 UTC. */
export const startOfUtcMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** When today's spend cap resets: the next midnight UTC. */
export const nextUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

/** When this month's cap resets: the first of the next month, 00:00 UTC. */
export const nextUtcMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

/** What this account spent, or every account together, since `from`. */
function spendSince(from: Date, accountId?: string): number {
  const where =
    accountId === undefined
      ? gte(xApiCalls.createdAt, from)
      : and(gte(xApiCalls.createdAt, from), eq(xApiCalls.accountId, accountId));
  const row = getDb()
    .select({ total: sql<string>`coalesce(sum(${xApiCalls.costMicros}), 0)` })
    .from(xApiCalls)
    .where(where)
    .get();
  return Number(row?.total ?? 0);
}

/** Spend for the current UTC day, week (from Monday) and month. */
export function getSpend(accountId: string | undefined, now = new Date()): SpendDto {
  return {
    todayMicros: spendSince(startOfUtcDay(now), accountId),
    weekMicros: spendSince(startOfUtcWeek(now), accountId),
    monthMicros: spendSince(startOfUtcMonth(now), accountId),
  };
}

const cap = (limitUsd: number | null, spentMicros: number, resetAt: Date): SpendCapDto => {
  const limitMicros = limitUsd === null ? null : usdToMicros(limitUsd);
  return {
    limitMicros,
    spentMicros,
    resetAt: resetAt.toISOString(),
    reached: limitMicros !== null && spentMicros >= limitMicros,
  };
};

const CAP_NAMES = ['daily', 'monthly'] as const;
type CapName = (typeof CAP_NAMES)[number];

/** Where a cap's spend is counted from, and when it resets: UTC day or UTC month. */
const capWindow = (name: CapName, now: Date): { from: Date; resetAt: Date } =>
  name === 'daily'
    ? { from: startOfUtcDay(now), resetAt: nextUtcDay(now) }
    : { from: startOfUtcMonth(now), resetAt: nextUtcMonth(now) };

/** A scope's caps and where its spend stands against them. */
const capsFor = (budget: SpendCaps, spend: SpendDto, now: Date) => ({
  daily: cap(budget.dailyCapUsd, spend.todayMicros, capWindow('daily', now).resetAt),
  monthly: cap(budget.monthlyCapUsd, spend.monthMicros, capWindow('monthly', now).resetAt),
});

const capValue = (budget: SpendCaps, name: CapName): number | null =>
  name === 'daily' ? budget.dailyCapUsd : budget.monthlyCapUsd;

/** Both caps and where spend stands against every account together: the hard limit. */
function getSpendCaps(now = new Date()) {
  return capsFor(getXApiSettings().budget, getSpend(undefined, now), now);
}

/** One account's own caps, inside the workspace's hard limit. */
function getAccountSpendCaps(accountId: string, now = new Date()) {
  return capsFor(getDiscoverySettings(accountId).budget, getSpend(accountId, now), now);
}

/** The handle a cap's message names; the id if the account was removed since the read started. */
const accountName = (accountId: string): string =>
  listAccounts().find(({ id }) => id === accountId)?.username ?? accountId;

type CapScope = {
  scope: BudgetScope;
  /** The account the cap belongs to; null for the workspace cap. */
  username: string | null;
  budget: SpendCaps;
  /** The account whose spend this scope sums; undefined sums every account. */
  accountId?: string;
};

/** Throws for the first cap this scope has reached, naming the cap and when it resets. */
function assertCaps({ scope, username, budget, accountId }: CapScope, now: Date): void {
  for (const name of CAP_NAMES) {
    const limit = capValue(budget, name);
    if (limit === null) continue;
    const { from, resetAt } = capWindow(name, now);
    const spentMicros = spendSince(from, accountId);
    if (spentMicros < usdToMicros(limit)) continue;
    throw new BudgetExceededError({
      scope,
      username,
      cap: name,
      resetAt,
      spentMicros,
      capMicros: usdToMicros(limit),
    });
  }
}

/**
 * Throws before a paid read would leave when either cap is reached. The account's own caps are
 * checked first, then the workspace's, which is the hard limit over every account together. A
 * call already in flight finishes; the job stops before its next page. The day cap is reported
 * first when both are hit.
 */
export function assertBudget(accountId: string, now = new Date()): void {
  assertCaps(
    {
      scope: 'account',
      username: accountName(accountId),
      budget: getDiscoverySettings(accountId).budget,
      accountId,
    },
    now,
  );
  assertCaps({ scope: 'workspace', username: null, budget: getXApiSettings().budget }, now);
}

/** Adds one row to the usage log. Errors keep X's status line, never a token or body. */
export function recordXApiCall(
  call: Pick<
    XApiCall,
    'accountId' | 'endpoint' | 'feature' | 'itemCount' | 'costMicros' | 'status'
  > & { error?: string | null; at?: Date },
): void {
  getDb()
    .insert(xApiCalls)
    .values({
      accountId: call.accountId,
      endpoint: call.endpoint,
      feature: call.feature,
      itemCount: call.itemCount,
      costMicros: call.costMicros,
      status: call.status,
      error: call.error ?? null,
      ...(call.at ? { createdAt: call.at } : {}),
    })
    .run();
}

/** An endpoint's last rate-limit headers; null before the first call. */
export function readRateLimit(accountId: string, endpoint: string) {
  return (
    getDb()
      .select()
      .from(xRateLimits)
      .where(and(eq(xRateLimits.accountId, accountId), eq(xRateLimits.endpoint, endpoint)))
      .get() ?? null
  );
}

/**
 * When the endpoint is throttled, or null when a call may start. A window X says has no room
 * left blocks until its reset; when both are empty, the later reset wins.
 */
export function rateLimitedUntil(
  accountId: string,
  endpoint: string,
  now = new Date(),
): Date | null {
  const row = readRateLimit(accountId, endpoint);
  if (!row) return null;
  const resets = [
    row.remaining === 0 ? row.resetAt : null,
    row.dayRemaining === 0 ? row.dayResetAt : null,
  ].filter((date): date is Date => date !== null && date.getTime() > now.getTime());
  let latest: Date | null = null;
  for (const date of resets) if (!latest || date > latest) latest = date;
  return latest;
}

const headerNumber = (headers: Headers, name: string): number | null => {
  const value = headers.get(name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const headerDate = (headers: Headers, name: string): Date | null => {
  const seconds = headerNumber(headers, name);
  return seconds === null ? null : new Date(seconds * 1000);
};

/** X reports the per-user 24-hour window; fall back to the app's when an endpoint has only that. */
const dayLimitPrefix = (headers: Headers): string =>
  headers.has('x-user-limit-24hour-limit') || headers.has('x-user-limit-24hour-remaining')
    ? 'x-user-limit-24hour'
    : 'x-app-limit-24hour';

/**
 * When the window a 429 exhausted resets: the later of the empty windows. No empty window (or no
 * headers) returns null, so the caller can fall back to a conservative wait.
 */
export function rateLimitReset(headers: Headers, now = new Date()): Date | null {
  const prefix = dayLimitPrefix(headers);
  const shortReset = headerDate(headers, 'x-rate-limit-reset');
  const dayReset = headerDate(headers, `${prefix}-reset`);
  const exhausted = [
    headerNumber(headers, 'x-rate-limit-remaining') === 0 ? shortReset : null,
    headerNumber(headers, `${prefix}-remaining`) === 0 ? dayReset : null,
  ].filter((date): date is Date => date !== null && date.getTime() > now.getTime());
  let latest: Date | null = null;
  for (const date of exhausted) if (!latest || date > latest) latest = date;
  if (latest) return latest;
  // A 429 that doesn't say which limit it hit: keep the first future reset it reports.
  for (const date of [shortReset, dayReset]) {
    if (date && date.getTime() > now.getTime()) return date;
  }
  return null;
}

/** Stores X's rate-limit headers for the account's endpoint; missing ones become null. */
export function saveRateLimits(
  accountId: string,
  endpoint: string,
  headers: Headers,
  now = new Date(),
  /** A 429's blocking window wins over the headers, which may describe another window. */
  overrides: { remaining?: number; resetAt?: Date } = {},
): void {
  const dayPrefix = dayLimitPrefix(headers);
  const values = {
    accountId,
    endpoint,
    limit: headerNumber(headers, 'x-rate-limit-limit'),
    remaining: overrides.remaining ?? headerNumber(headers, 'x-rate-limit-remaining') ?? null,
    resetAt: overrides.resetAt ?? headerDate(headers, 'x-rate-limit-reset') ?? null,
    dayLimit: headerNumber(headers, `${dayPrefix}-limit`),
    dayRemaining: headerNumber(headers, `${dayPrefix}-remaining`),
    dayResetAt: headerDate(headers, `${dayPrefix}-reset`),
    updatedAt: now,
  };
  getDb()
    .insert(xRateLimits)
    .values(values)
    .onConflictDoUpdate({
      target: [xRateLimits.accountId, xRateLimits.endpoint],
      set: values,
    })
    .run();
}

const toRateLimitDto = (row: {
  endpoint: string;
  limit: number | null;
  remaining: number | null;
  resetAt: Date | null;
  dayLimit: number | null;
  dayRemaining: number | null;
  dayResetAt: Date | null;
  updatedAt: Date;
}): XRateLimitDto => ({
  endpoint: row.endpoint,
  limit: row.limit,
  remaining: row.remaining,
  resetAt: row.resetAt?.toISOString() ?? null,
  dayLimit: row.dayLimit,
  dayRemaining: row.dayRemaining,
  dayResetAt: row.dayResetAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

/** The newest calls, with the account's handle, for the Settings page and later the REST API. */
export function listRecentCalls(limit = 20): XApiCallDto[] {
  return getDb()
    .select({
      id: xApiCalls.id,
      accountId: xApiCalls.accountId,
      username: xAccounts.username,
      endpoint: xApiCalls.endpoint,
      feature: xApiCalls.feature,
      itemCount: xApiCalls.itemCount,
      costMicros: xApiCalls.costMicros,
      status: xApiCalls.status,
      error: xApiCalls.error,
      createdAt: xApiCalls.createdAt,
    })
    .from(xApiCalls)
    .innerJoin(xAccounts, eq(xAccounts.id, xApiCalls.accountId))
    .orderBy(desc(xApiCalls.createdAt))
    .limit(limit)
    .all()
    .map((call) => ({
      id: call.id,
      accountId: call.accountId,
      username: call.username,
      endpoint: call.endpoint,
      feature: call.feature,
      itemCount: call.itemCount,
      costMicros: call.costMicros,
      status: call.status,
      error: call.error,
      createdAt: call.createdAt.toISOString(),
    }));
}

/** What Settings shows: spend per account and overall, caps, rate limits and the latest calls. */
export function getXApiUsage(now = new Date()): XApiUsageDto {
  const accounts: XApiAccountUsageDto[] = listAccounts().map((account) => ({
    id: account.id,
    username: account.username,
    spend: getSpend(account.id, now),
    caps: getAccountSpendCaps(account.id, now),
    rateLimits: getDb()
      .select()
      .from(xRateLimits)
      .where(eq(xRateLimits.accountId, account.id))
      .orderBy(asc(xRateLimits.endpoint))
      .all()
      .map(toRateLimitDto),
  }));
  return {
    generatedAt: now.toISOString(),
    accounts,
    spend: getSpend(undefined, now),
    caps: getSpendCaps(now),
    settings: getXApiSettings(),
    resultsPerCall: X_SEARCH_RESULTS_PER_CALL,
    calls: listRecentCalls(),
  };
}
