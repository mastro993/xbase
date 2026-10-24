// JSON responses for server routes. API answers are per-user data: never cache them.

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return Response.json(body, { ...init, headers });
}

/** An error body: `{ error, message? }`, where `error` is a stable machine-readable code. */
export function jsonError(
  status: number,
  error: string,
  message?: string,
  init: ResponseInit = {},
): Response {
  return json(message === undefined ? { error } : { error, message }, { ...init, status });
}
