// Shared by every provider call: one JSON request with a timeout, and short user-facing errors.

const TIMEOUT_MS = 60_000;

interface ApiError {
  // xAI sends a bare string; everyone else sends { message }.
  error?: string | { message?: string };
}

function httpError(status: number, message: string): string {
  // xAI answers a bad key with 400 "Incorrect API key provided".
  if (status === 401 || (status === 400 && /api key/i.test(message))) return 'Invalid API key';
  if (status === 402) return 'Out of credits. Check billing with your provider.';
  if (status === 429) return 'Rate limit or quota reached. Wait a moment, or check your plan.';
  return `${status}: ${message}`;
}

const isTimeout = (e: unknown) => e instanceof DOMException && e.name === 'TimeoutError';

/** A non-2xx answer, with its status for callers that branch on it. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMessage = 'The model took too long. Try a faster model.',
): Promise<T> {
  let res: Response;
  let raw: string;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    raw = await res.text();
  } catch (e) {
    throw new Error(isTimeout(e) ? timeoutMessage : 'Network error. Check your connection.', {
      cause: e,
    });
  }
  let body: (T & ApiError) | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Non-JSON body (e.g. a proxy's HTML error page): fall back to the HTTP status.
  }
  const err = body?.error;
  const message =
    typeof err === 'string' ? err : err ? (err.message ?? 'Unknown error') : undefined;
  if (!res.ok) {
    throw new HttpError(
      res.status,
      httpError(res.status, message || res.statusText || 'Request failed'),
    );
  }
  // OpenRouter can fail with HTTP 200 and a top-level error.
  if (message) throw new Error(message);
  if (!body) throw new Error('Unexpected response from the provider.');
  return body;
}
