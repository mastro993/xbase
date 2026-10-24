// HTTP plumbing for the endpoints other apps call: metadata, token, register and revoke. They allow
// any origin without credentials, because browser-based MCP clients call them; the consent page and
// /mcp never send CORS headers.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
};

/** The answer to a CORS preflight (OPTIONS). */
export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Max-Age': '86400' },
  });
}

/** JSON with CORS, not cached unless `headers` says otherwise. */
export function publicJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS, 'Cache-Control': 'no-store', ...headers },
  });
}

/** An OAuth error body (RFC 6749 §5.2). */
export function oauthError(
  status: number,
  error: string,
  description?: string,
  headers?: Record<string, string>,
): Response {
  const body = description === undefined ? { error } : { error, error_description: description };
  return publicJson(body, status, headers);
}

/** An empty 200 with CORS: what RFC 7009 revocation answers. */
export function emptyOk(): Response {
  return new Response(null, { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

/** The `ANY` handler of an OAuth route; without it, other methods fall through to the page renderer. */
export function methodNotAllowed(allow: string): () => Response {
  return () => oauthError(405, 'method_not_allowed', undefined, { Allow: allow });
}

/** Reads a body as text, or null as soon as it grows past maxBytes. */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | null> {
  if (!body) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for await (const chunk of body) {
    size += chunk.byteLength;
    // Leaving the loop early cancels the stream, so the rest is never read.
    if (size > maxBytes) return null;
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

const MAX_FORM_BYTES = 16 * 1024;

/**
 * The parameters of a token or revocation request: form-urlencoded only (RFC 6749 §3.2, and what
 * Claude sends), each of `once` at most once. A Response is the error to send instead.
 */
export async function readOAuthForm(
  request: Request,
  once: readonly string[],
): Promise<URLSearchParams | Response> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return oauthError(
      400,
      'invalid_request',
      'Send the parameters as application/x-www-form-urlencoded.',
    );
  }
  const text = await readCapped(request.body, MAX_FORM_BYTES);
  if (text === null) return oauthError(413, 'invalid_request', 'The request body is too large.');
  const form = new URLSearchParams(text);
  const repeated = once.find((name) => form.getAll(name).length > 1);
  if (repeated) return oauthError(400, 'invalid_request', `${repeated} appears more than once.`);
  return form;
}

/**
 * The client_id of a request: from the form, or from HTTP Basic, which some public clients send
 * with an empty secret (RFC 6749 §2.3.1 form-encodes both parts).
 */
export function requestClientId(request: Request, form: URLSearchParams): string | null {
  const fromForm = form.get('client_id');
  if (fromForm) return fromForm;
  const basic = /^Basic +([A-Za-z0-9+/]+=*) *$/i.exec(request.headers.get('authorization') ?? '');
  if (!basic?.[1]) return null;
  try {
    const decoded = atob(basic[1]);
    const id = decoded.slice(0, decoded.includes(':') ? decoded.indexOf(':') : undefined);
    return decodeURIComponent(id.replaceAll('+', ' ')) || null;
  } catch {
    return null;
  }
}
