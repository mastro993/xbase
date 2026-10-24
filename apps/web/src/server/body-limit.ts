import { createMiddleware } from '@tanstack/react-start';
import { jsonError } from '@xbase/server/http';

// Start reads a server function's whole body before any function middleware runs, so before
// serverFnGuard can turn a stranger away, and the Node server sets no size limit. This request
// middleware refuses big bodies from their Content-Length first. It's registered in src/start.ts,
// which the client bundles too: the check stays inside .server(), which the compiler strips there.

/**
 * The largest body a server function accepts. A saved thread is the largest real one: 25 posts
 * of 25,000 UTF-16 units, each up to 7 bytes once seroval and then JSON escape it (U+2028 becomes
 * `\\u2028`), about 4.4 MB. Double that leaves room.
 */
export const MAX_SERVER_FN_BODY = 8 * 1024 * 1024;

export const serverFnBodyLimit = createMiddleware().server(({ next, request, handlerType }) => {
  if (handlerType !== 'serverFn' || request.method === 'GET' || request.method === 'HEAD') {
    return next();
  }
  // Node never reads past Content-Length, so checking the header is enough. Browsers and Start's
  // client always send one; a chunked body of unknown size would be read to its end.
  const length = request.headers.get('content-length');
  if (length === null && request.headers.has('transfer-encoding')) {
    return jsonError(411, 'length_required', 'Send a Content-Length.');
  }
  if (Number(length) > MAX_SERVER_FN_BODY) {
    return jsonError(413, 'payload_too_large', 'The request is too large.');
  }
  return next();
});
