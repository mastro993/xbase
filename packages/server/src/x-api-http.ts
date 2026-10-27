import { InvalidStateError, NotFoundError, RateLimitedError } from '@xbase/core/errors';
import type { XApiFeature } from '@xbase/core/x-api';
import { type XAccountCredentials, getAccountCredentials, saveAccountTokens } from './accounts';
import { decryptToken } from './token-crypto';
import { assertBudget, rateLimitedUntil, recordXApiCall, saveRateLimits } from './x-api-usage';
import { refreshXTokens } from './x-auth';

// The HTTP and token plumbing behind x-api-client.ts: one GET to X, the stored 429 wait, the spend
// caps, the account's own token and the usage log. Kept apart from the typed reads so the reads
// stay about posts and pages.

const API = 'https://api.x.com/2';
const TIMEOUT_MS = 15_000;
/** Renew an access token slightly before it expires, so a call doesn't race the clock. */
const REFRESH_WITHIN_MS = 60_000;
const RETRY_DEFAULT_MS = 15 * 60_000;

/** The token a call goes out with: decrypt it, or renew it first when it is about to expire. */
function accessToken(credentials: XAccountCredentials): string {
  const token = decryptToken(credentials.accessToken, `${credentials.id}:access`);
  if (token === null) {
    throw new InvalidStateError(
      `X access for @${credentials.username} can’t be read. Sign in again.`,
    );
  }
  return token;
}

/** One renewal per account at a time: concurrent calls wait for the same rotated token. */
const renewals = new Map<string, Promise<void>>();

function renew(accountId: string): Promise<void> {
  const running = renewals.get(accountId);
  if (running) return running;
  const promise = renewNow(accountId).finally(() => renewals.delete(accountId));
  renewals.set(accountId, promise);
  return promise;
}

async function renewNow(accountId: string): Promise<void> {
  const account = getAccountCredentials(accountId);
  if (!account) throw new NotFoundError('Account not found.');
  const refreshToken = account.refreshToken
    ? decryptToken(account.refreshToken, `${accountId}:refresh`)
    : null;
  if (!refreshToken) {
    throw new InvalidStateError(`X access for @${account.username} expired. Sign in again.`);
  }
  try {
    saveAccountTokens(accountId, await refreshXTokens(refreshToken));
  } catch {
    throw new InvalidStateError(
      `X could not renew access for @${account.username}. Sign in again.`,
    );
  }
}

async function callToken(account: XAccountCredentials): Promise<string> {
  if (account.expiresAt.getTime() > Date.now() + REFRESH_WITHIN_MS) return accessToken(account);
  await renew(account.id);
  const renewed = getAccountCredentials(account.id);
  if (!renewed) throw new NotFoundError('Account not found.');
  return accessToken(renewed);
}

const responseDetail = (body: unknown): string => {
  if (body === null) return '';
  if (typeof body === 'object' && 'detail' in body) return String(body.detail).slice(0, 300);
  const text = JSON.stringify(body);
  return text === undefined ? '' : text.slice(0, 300);
};

/** When X says the window resets: its header, Retry-After, or a conservative quarter hour. */
function resetAt(response: Response, now: Date): Date {
  const header = Number(response.headers.get('x-rate-limit-reset'));
  if (Number.isFinite(header) && header > 0) return new Date(header * 1000);
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return new Date(now.getTime() + retryAfter * 1000);
  }
  return new Date(now.getTime() + RETRY_DEFAULT_MS);
}

type RequestOptions = {
  accountId: string;
  /** Canonical, without an account id: the rate-limit key and the usage log's endpoint. */
  endpoint: string;
  /** The path below /2, e.g. `/tweets`. */
  path: string;
  params?: Record<string, string | undefined>;
  feature: XApiFeature;
  /** How to count the response's reads and their price, for the usage log. */
  cost: (body: unknown) => { itemCount: number; costMicros: number };
};

/**
 * One GET to X, with every guard in one place: the stored 429 wait, the spend caps, the account's
 * token, the rate-limit headers and the usage log. A 429 stores its reset time and throws, so the
 * next call waits instead of retrying in a loop.
 */
export async function xRequest({
  accountId,
  endpoint,
  path,
  params = {},
  feature,
  cost,
}: RequestOptions): Promise<unknown> {
  const account = getAccountCredentials(accountId);
  if (!account) throw new NotFoundError('Account not found.');

  const blocked = rateLimitedUntil(accountId, endpoint);
  if (blocked) throw new RateLimitedError({ endpoint, resetAt: blocked });
  assertBudget();

  const token = await callToken(account);
  const startedAt = new Date();
  const url = new URL(`${API}${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The request failed.';
    recordXApiCall({
      accountId,
      endpoint,
      feature,
      itemCount: 0,
      costMicros: 0,
      status: 'error',
      error: message.slice(0, 300),
      at: startedAt,
    });
    throw new Error(`X request failed: ${message}`, { cause: error });
  }

  // A 429 may omit the headers; it still blocks the endpoint until the reported reset. Other
  // responses without rate-limit headers leave the last known window alone.
  const retryAt = response.status === 429 ? resetAt(response, startedAt) : null;
  if (
    retryAt ||
    response.headers.has('x-rate-limit-limit') ||
    response.headers.has('x-user-limit-24hour-limit')
  ) {
    saveRateLimits(
      accountId,
      endpoint,
      response.headers,
      startedAt,
      retryAt ? { remaining: 0, resetAt: retryAt } : {},
    );
  }
  const body: unknown = await response.json().catch(() => null);

  if (response.status === 429 && retryAt) {
    recordXApiCall({
      accountId,
      endpoint,
      feature,
      itemCount: 0,
      costMicros: 0,
      status: 'rate_limited',
      error: 'X answered 429',
      at: startedAt,
    });
    throw new RateLimitedError({ endpoint, resetAt: retryAt });
  }

  if (!response.ok) {
    const detail = responseDetail(body);
    recordXApiCall({
      accountId,
      endpoint,
      feature,
      itemCount: 0,
      costMicros: 0,
      status: 'error',
      error: `X answered ${response.status}${detail ? `: ${detail}` : ''}`.slice(0, 300),
      at: startedAt,
    });
    if (response.status === 401) {
      throw new InvalidStateError(`X rejected @${account.username}’s access. Sign in again.`);
    }
    throw new Error(`X answered ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  let counted = { itemCount: 0, costMicros: 0 };
  try {
    counted = cost(body);
  } catch {
    // The caller's parser reports the unreadable shape; the log still records the call.
  }
  recordXApiCall({
    accountId,
    endpoint,
    feature,
    ...counted,
    status: 'ok',
    at: startedAt,
  });
  return body;
}
