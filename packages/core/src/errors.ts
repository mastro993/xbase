// Expected failures of the domain services (posts, saved searches, AI settings, X API reads).
// Server routes turn them into HTTP statuses, MCP tools into isError results, and server functions
// hand the message to the UI. Anything else is a bug.

const STATUS = {
  invalid_request: 400,
  not_found: 404,
  invalid_state: 409,
  reconnect_required: 409,
  budget_exceeded: 402,
  rate_limited: 429,
} as const;
type ServiceErrorCode = keyof typeof STATUS;

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: (typeof STATUS)[ServiceErrorCode];

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Bad input: a 400. */
export class ValidationError extends ServiceError {
  constructor(message: string) {
    super('invalid_request', message);
  }
}

/** No such row: a 404. */
export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super('not_found', message);
  }
}

/** The row exists but its state forbids the change, e.g. editing a published post: a 409. */
export class InvalidStateError extends ServiceError {
  constructor(message: string) {
    super('invalid_state', message);
  }
}

/** X reported no room left in the window; the caller may try again after `resetAt`: a 429. */
export class RateLimitedError extends ServiceError {
  readonly endpoint: string;
  readonly resetAt: Date;

  constructor({ endpoint, resetAt }: { endpoint: string; resetAt: Date }) {
    super(
      'rate_limited',
      `X is rate-limiting ${endpoint}. Try again after ${resetAt.toISOString()}.`,
    );
    this.endpoint = endpoint;
    this.resetAt = resetAt;
  }
}

/** X refused the account's access (a 401 or a dead refresh token): it must sign in again: a 409. */
export class ReconnectRequiredError extends ServiceError {
  readonly accountId: string;

  constructor({ accountId, username }: { accountId: string; username: string }) {
    super(
      'reconnect_required',
      `X no longer accepts @${username}’s access. Sign in again to keep reading X with it.`,
    );
    this.accountId = accountId;
  }
}

/** Which spend a cap limits: one account's reads, or every account's together. */
export type BudgetScope = 'account' | 'workspace';

/** A spend cap stopped a paid read before it was sent: a 402. */
export class BudgetExceededError extends ServiceError {
  readonly cap: 'daily' | 'monthly';
  readonly scope: BudgetScope;
  readonly resetAt: Date;
  readonly spentMicros: number;
  readonly capMicros: number;

  constructor(limit: {
    cap: 'daily' | 'monthly';
    scope: BudgetScope;
    /** The account the cap belongs to; null for the workspace cap. */
    username: string | null;
    resetAt: Date;
    spentMicros: number;
    capMicros: number;
  }) {
    const spending = limit.username === null ? 'for this XBase' : `for @${limit.username}`;
    super(
      'budget_exceeded',
      `The ${limit.cap} X API spend cap of $${(limit.capMicros / 1_000_000).toFixed(2)} ${spending} ` +
        `is reached. It resets at ${limit.resetAt.toISOString()}.`,
    );
    this.cap = limit.cap;
    this.scope = limit.scope;
    this.resetAt = limit.resetAt;
    this.spentMicros = limit.spentMicros;
    this.capMicros = limit.capMicros;
  }
}
