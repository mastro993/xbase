import type { AuthorizeError } from '@xbase/core/consent';
import { findClient } from './clients';
import { oauthConfig } from './config';
import { type AuthorizeRequest, beginConsent, takeConsent } from './consent';
import { hashSecret, newSecret } from './crypto';
import { readCapped } from './http';
import { redirectAllowed, redirectMatches } from './redirect-uri';
import { matchResource } from './resource';
import { insertCode } from './store';

// GET and POST /oauth/authorize. The owner is already signed in (pageGuard sends everyone else to
// /login and back), so the remaining danger is sending a code, or any answer, somewhere the client
// never registered.

type AuthorizeGate =
  | { kind: 'ok'; request: AuthorizeRequest }
  | { kind: 'page'; error: AuthorizeError }
  | { kind: 'redirect'; location: string };

const PKCE_CHALLENGE = /^[\w-]{43}$/;
// Parameters that may appear once; resource may repeat (RFC 8707).
const ONCE = ['response_type', 'state', 'code_challenge', 'code_challenge_method', 'scope'];
const MAX_FORM_BYTES = 4096;

/** An authorization response on the client's redirect URI, always with `iss` (RFC 9207). */
function authorizationResponse(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(name, value);
  }
  url.searchParams.set('iss', oauthConfig().issuer);
  return url.href;
}

/**
 * Validates an authorization request. Until the client and its redirect URI check out, errors
 * stay on XBase's own page: redirecting to an unchecked URI would be an open redirect.
 */
export async function checkAuthorizeRequest(query: URLSearchParams): Promise<AuthorizeGate> {
  const [clientId, ...extraClientIds] = query.getAll('client_id');
  const [redirectUri, ...extraRedirectUris] = query.getAll('redirect_uri');
  if (!clientId || !redirectUri || extraClientIds.length > 0 || extraRedirectUris.length > 0) {
    return { kind: 'page', error: 'invalid_request' };
  }
  const client = await findClient(clientId);
  if (!client) return { kind: 'page', error: 'unknown_client' };
  const registered = client.redirectUris.some((uri) => redirectMatches(uri, redirectUri));
  if (!redirectAllowed(redirectUri) || !registered) {
    return { kind: 'page', error: 'invalid_redirect_uri' };
  }

  // From here on the client gets errors on its redirect URI.
  const repeated = ONCE.find((name) => query.getAll(name).length > 1);
  const state = repeated === 'state' ? null : query.get('state');
  const fail = (error: string, description: string): AuthorizeGate => ({
    kind: 'redirect',
    location: authorizationResponse(redirectUri, { error, error_description: description, state }),
  });
  if (repeated) return fail('invalid_request', `${repeated} appears more than once.`);
  if (query.get('response_type') !== 'code') {
    return fail('unsupported_response_type', 'Only response_type=code is supported.');
  }
  const codeChallenge = query.get('code_challenge') ?? '';
  if (query.get('code_challenge_method') !== 'S256' || !PKCE_CHALLENGE.test(codeChallenge)) {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  const config = oauthConfig();
  const resource = matchResource(query.getAll('resource'), config);
  if (!resource) return fail('invalid_target', `The only resource here is ${config.resource}.`);
  return {
    kind: 'ok',
    request: {
      clientId: client.clientId,
      clientName: client.clientName,
      kind: client.kind,
      redirectUri,
      state,
      codeChallenge,
      // One scope covers every tool; extras such as offline_access are ignored, not refused.
      scope: config.scope,
      resource,
    },
  };
}

const redirect = (status: 302 | 303, location: string) =>
  new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });

const consentPage = (search: Record<string, string>) =>
  redirect(303, `/oauth/authorize?${new URLSearchParams(search)}`);

/** True for the consent page's own URL: `?consent=…` or `?error=…`. */
const isConsentPage = (query: URLSearchParams) =>
  query.size === 1 && (query.has('consent') || query.has('error'));

/**
 * GET /oauth/authorize: the redirect to answer with, or undefined to render the consent page. A
 * valid request becomes a pending consent, and the browser moves to `?consent=<id>`.
 */
export async function startAuthorization(
  request: Request,
  sessionId: string | null,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (isConsentPage(url.searchParams)) return undefined;
  // pageGuard answers first; this keeps metadata fetches away from strangers if that ever changes.
  if (!sessionId) {
    return redirect(303, `/login?${new URLSearchParams({ next: url.pathname + url.search })}`);
  }
  const gate = await checkAuthorizeRequest(url.searchParams);
  switch (gate.kind) {
    case 'redirect':
      return redirect(302, gate.location);
    case 'page':
      return consentPage({ error: gate.error });
    case 'ok':
      return consentPage({ consent: beginConsent(gate.request, sessionId) });
  }
}

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** POST /oauth/authorize: the owner's answer, sent back to the app with a code or access_denied. */
export async function decideConsent(
  request: Request,
  sessionId: string | null,
  now = new Date(),
): Promise<Response> {
  const { issuer, codeTtlMs } = oauthConfig();
  // The form is posted by the consent page itself; another origin means a forged request.
  if (request.headers.get('origin') !== issuer) {
    return plain(403, 'Answer from the XBase consent page.');
  }
  if (!sessionId) return plain(401, 'Sign in to XBase, then start again from your app.');
  const form = new URLSearchParams((await readCapped(request.body, MAX_FORM_BYTES)) ?? '');
  const pending = takeConsent(form.get('consent_id') ?? '', sessionId, now.getTime());
  if (!pending) return consentPage({ error: 'expired' });

  if (form.get('decision') !== 'approve') {
    return redirect(
      303,
      authorizationResponse(pending.redirectUri, {
        error: 'access_denied',
        error_description: 'The owner denied access.',
        state: pending.state,
      }),
    );
  }
  const code = newSecret();
  insertCode({
    codeHash: hashSecret(code),
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    scope: pending.scope,
    resource: pending.resource,
    expiresAt: new Date(now.getTime() + codeTtlMs),
  });
  return redirect(303, authorizationResponse(pending.redirectUri, { code, state: pending.state }));
}
