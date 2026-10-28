import { createHash } from 'node:crypto';
import type { SignInError } from '@xbase/core/auth';
import { z } from 'zod';
import { accountExists, listAccounts, type XProfile, type XTokens } from './accounts';
import { getEnv } from './env';

// Signing in with X: OAuth 2.0 authorization code with PKCE, through the owner's X app
// (X_CLIENT_ID, X_CLIENT_SECRET). The web app runs the browser's side of the flow; this is X's
// side, and who may get in. These two calls (token, users/me) are the only X requests outside the
// read layer (x-api-client.ts and x-api-http.ts): signing in happens before an account exists, so
// there is no account token, budget or cache to go through. Every read a feature makes goes
// through that layer.

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me?user.fields=profile_image_url';
/**
 * Reading the profile and the follow, mute and block lists (discovery marks posts by followed
 * accounts and never suggests muted or blocked ones), plus posting for the scheduler;
 * offline.access brings a refresh token.
 */
const SCOPES = [
  'tweet.read',
  'users.read',
  'follows.read',
  'mute.read',
  'block.read',
  'tweet.write',
  'offline.access',
];
const TIMEOUT_MS = 15_000;

/** The callback X redirects to; register it in the X app as well. */
const callbackUrl = () => `${getEnv().APP_URL}/auth/x/callback`;

/** X's authorization URL for a flow's `state` and PKCE `verifier`. */
export function xAuthorizeUrl({ state, verifier }: { state: string; verifier: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: getEnv().X_CLIENT_ID,
    redirect_uri: callbackUrl(),
    scope: SCOPES.join(' '),
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

async function xJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`X answered ${response.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
  }
  return body;
}

/**
 * X refused a token grant: a refresh token is expired or revoked, and only signing in again
 * gives the account a working one.
 */
export class XTokenRejectedError extends Error {
  constructor(detail: string) {
    super(`X refused the token: ${detail}`);
    this.name = 'XTokenRejectedError';
  }
}

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string(),
});

const isInvalidGrant = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && 'error' in body && body.error === 'invalid_grant';

const toTokens = (body: z.infer<typeof TokenResponse>): XTokens => ({
  accessToken: body.access_token,
  refreshToken: body.refresh_token ?? null,
  expiresAt: new Date(Date.now() + body.expires_in * 1000),
  scope: body.scope,
});

/**
 * POSTs one token grant as a confidential client: the app's credentials go in a Basic header
 * (RFC 6749 §2.3.1). A 401 or `invalid_grant` means the grant itself is dead, which is a
 * different answer from a request X could not serve, so the caller can flag the account.
 */
async function requestTokens(form: URLSearchParams): Promise<XTokens> {
  const { X_CLIENT_ID, X_CLIENT_SECRET } = getEnv();
  const credentials = `${encodeURIComponent(X_CLIENT_ID)}:${encodeURIComponent(X_CLIENT_SECRET)}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = JSON.stringify(body)?.slice(0, 300) ?? '';
    if (response.status === 401 || isInvalidGrant(body)) throw new XTokenRejectedError(detail);
    throw new Error(`X answered ${response.status}: ${detail}`);
  }
  return toTokens(TokenResponse.parse(body));
}

/** The authorization code's tokens, for a first sign-in or an account added later. */
export async function exchangeXCode(code: string, verifier: string): Promise<XTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(),
      code_verifier: verifier,
    }),
  );
}

const MeResponse = z.object({
  data: z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    name: z.string(),
    profile_image_url: z.string().optional(),
  }),
});

/**
 * Renews an account's access with its refresh token. X rotates the refresh token, so the caller
 * saves both; a response without one keeps the stored token. Throws XTokenRejectedError when X
 * no longer honours the refresh token.
 */
export async function refreshXTokens(refreshToken: string): Promise<XTokens> {
  return requestTokens(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  );
}

/** Who the access token belongs to. */
export async function fetchXProfile(accessToken: string): Promise<XProfile> {
  const { data } = MeResponse.parse(
    await xJson(ME_URL, { headers: { authorization: `Bearer ${accessToken}` } }),
  );
  return {
    id: data.id,
    username: data.username,
    name: data.name,
    avatarUrl: data.profile_image_url ?? null,
  };
}

/**
 * Why `profile` may not sign in, or null when it may. The first account claims this XBase (only
 * X_OWNER_USERNAME's, when set); after that, only linked accounts get in.
 */
export function signInRefusal(
  profile: XProfile,
): Extract<SignInError, 'not_linked' | 'not_owner'> | null {
  if (accountExists(profile.id)) return null;
  if (listAccounts().length > 0) return 'not_linked';
  const owner = getEnv().X_OWNER_USERNAME;
  if (owner && profile.username.toLowerCase() !== owner) return 'not_owner';
  return null;
}
