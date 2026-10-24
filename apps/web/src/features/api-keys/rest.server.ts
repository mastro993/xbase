import { ServiceError, ValidationError } from '@/lib/errors';
import { jsonError } from '@/server/http';
import { verifyApiKey } from './api-keys.server';

// Plumbing for the REST API (src/routes/api/v1). pageGuard lets every /api path through, so each
// v1 handler must be wrapped in withApiKey.

const BEARER = /^Bearer +(\S+) *$/i;

/**
 * Runs `handler` only for a request with `Authorization: Bearer <API key>`; anything else gets a
 * 401. Service errors become their status with `{ error, message }`. Called inside each route
 * handler, so the route's typed params stay in scope.
 */
export async function withApiKey(
  request: Request,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const token = BEARER.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || !verifyApiKey(token)) {
    return jsonError(401, 'unauthorized', 'Send a valid API key as a Bearer token.', {
      // RFC 6750: name the problem only when a token was sent.
      headers: { 'WWW-Authenticate': token ? 'Bearer error="invalid_token"' : 'Bearer' },
    });
  }
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.status, error.code, error.message);
    console.error('[api] request failed', error);
    return jsonError(500, 'internal_error', 'Something went wrong on the server.');
  }
}

/**
 * The `ANY` handler of a v1 route. Without it, other methods fall through to the page renderer
 * and get HTML.
 */
export function methodNotAllowed(allow: string): () => Response {
  return () => jsonError(405, 'method_not_allowed', undefined, { headers: { Allow: allow } });
}

/** The request's JSON body; a missing or malformed one is a 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('The request body must be JSON.');
  }
}
