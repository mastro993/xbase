// Expected failures of the domain services (posts, saved searches, AI settings). Server routes turn
// them into HTTP statuses, MCP tools into isError results, and server functions hand the message to
// the UI. Anything else is a bug.

const STATUS = { invalid_request: 400, not_found: 404, invalid_state: 409 } as const;
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
