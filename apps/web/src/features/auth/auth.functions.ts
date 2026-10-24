import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { deleteAllSessions } from '@xbase/server/sessions';
import { readSession, revokeSession } from './session.server';

// Signing in happens in the /auth/x server routes (x-oauth.server.ts). Redirects use 303 so a
// browser follows a native form POST with a GET.

/** Public (see guards.ts): lets routes check for a session before they render. */
export const getAuthStateFn = createServerFn().handler(() => ({
  authenticated: readSession() !== null,
}));

/** Public (see guards.ts): without a session it only clears the cookie. */
export const logoutFn = createServerFn({ method: 'POST' }).handler(() => {
  revokeSession();
  throw redirect({ to: '/login', statusCode: 303 });
});

/** Ends every session, this one included. */
export const signOutEverywhereFn = createServerFn({ method: 'POST' }).handler(() => {
  revokeSession();
  deleteAllSessions();
  throw redirect({ to: '/login', statusCode: 303 });
});
