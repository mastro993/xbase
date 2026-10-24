import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { parseLoginForm } from './auth.schema';
import { attemptLogin, readSession, revokeAllSessions, revokeSession } from './session.server';

// Redirects use 303 so a browser follows a native form POST with a GET. Expected failures
// redirect with ?error= instead of throwing, which a form without JavaScript couldn't show.

/** Public (see guards.ts). Takes the login form's FormData, with or without JavaScript. */
export const loginFn = createServerFn({ method: 'POST' })
  .validator(parseLoginForm)
  .handler(({ data }) => {
    const error = attemptLogin(data.password);
    if (error) {
      throw redirect({ to: '/login', search: { error, next: data.next }, statusCode: 303 });
    }
    // A document load, not a client-side navigation: `next` may be a server route such as
    // /oauth/authorize, whose GET handler must see the request with its query untouched.
    throw redirect({ href: data.next, statusCode: 303, reloadDocument: true });
  });

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
  revokeAllSessions();
  throw redirect({ to: '/login', statusCode: 303 });
});
