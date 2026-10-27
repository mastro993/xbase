// Expected failures of the domain services (posts, saved searches, AI settings, X API reads).
// Server routes turn them into HTTP statuses, MCP tools into isError results, and server functions
// hand the message to the UI. Anything else is a bug.

const STATUS = {
  invalid_request: 400,
  not_found: 404,
  invalid_state: 409,
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

/** A spend cap stopped a paid read before it was sent: a 402. */
export class BudgetExceededError extends ServiceError {
  readonly cap: 'daily' | 'monthly';
  readonly resetAt: Date;
  readonly spentMicros: number;
  readonly capMicros: number;

  constructor(cap: {
    cap: 'daily' | 'monthly';
    resetAt: Date;
    spentMicros: number;
    capMicros: number;
  }) {
    super(
      'budget_exceeded',
      `The ${cap.cap} X API spend cap of $${(cap.capMicros / 1_000_000).toFixed(2)} is reached. ` +
        `It resets at ${cap.resetAt.toISOString()}.`,
    );
    this.cap = cap.cap;
    this.resetAt = cap.resetAt;
    this.spentMicros = cap.spentMicros;
    this.capMicros = cap.capMicros;
  }
}
