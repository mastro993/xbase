import { createServerEntry, getResponseHeaders } from '@tanstack/react-start/server';

/**
 * Runs `fn` inside a real Start request scope, so getCookie, setCookie, getRequestIP and the
 * other request helpers work in a unit test. Resolves to fn's result and the response, which
 * carries the cookies and headers fn set; rejects with what fn throws.
 */
export async function inRequest<T>(
  request: Request,
  fn: () => T | Promise<T>,
): Promise<{ result: T; response: Response }> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
  const entry = createServerEntry({
    fetch: async () => {
      try {
        outcome = { ok: true, value: await fn() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      // What setCookie and setResponseHeader wrote; a real handler's response gets these too.
      const headers = new Headers();
      getResponseHeaders().forEach((value, name) => headers.append(name, value));
      return new Response(null, { headers });
    },
  });
  const response = await entry.fetch(request);
  if (!outcome) throw new Error('The request handler did not run');
  if (!outcome.ok) throw outcome.error;
  return { result: outcome.value, response };
}
