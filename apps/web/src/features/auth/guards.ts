import { redirect } from '@tanstack/react-router';
import { createMiddleware } from '@tanstack/react-start';
import { jsonError } from '@xbase/server/http';
import { readSession } from './session.server';

// Global middleware, registered in src/start.ts. This file is bundled for the client too: keep
// server-only calls inside the .server() callbacks, which the compiler strips there.

// Machine endpoints with their own auth (API keys, OAuth tokens) and signing in.
const PUBLIC_PATHS = new Set([
  '/login',
  '/auth/x/start',
  '/auth/x/callback',
  '/mcp',
  '/oauth/token',
  '/oauth/register',
  '/oauth/revoke',
]);
const PUBLIC_PREFIXES = ['/api/', '/.well-known/'];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * Pages and server routes need a session, except the public paths; a signed-out visitor goes to
 * /login and comes back afterwards. Server-function calls are left to serverFnGuard.
 */
export const pageGuard = createMiddleware().server(({ next, pathname, request, handlerType }) => {
  if (handlerType === 'serverFn' || isPublicPath(pathname) || readSession()) return next();
  const { search } = new URL(request.url);
  throw redirect({ to: '/login', search: { next: `${pathname}${search}` } });
});

// Server functions anyone may call; keys are `<file relative to apps/web>#<export name>`, as in
// Start's serverFnMeta. Every other server function needs a session. Signing out is public so
// that a session that already expired still lands on /login rather than a 401.
export const PUBLIC_SERVER_FNS: ReadonlySet<string> = new Set([
  'src/features/auth/auth.functions.ts#getAuthStateFn',
  'src/features/auth/auth.functions.ts#logoutFn',
]);

export const serverFnGuard = createMiddleware({ type: 'function' }).server(
  ({ next, serverFnMeta }) => {
    const key = `${serverFnMeta.filename}#${serverFnMeta.name}`;
    if (PUBLIC_SERVER_FNS.has(key) || readSession()) return next();
    throw jsonError(401, 'unauthorized', 'Sign in again.');
  },
);
