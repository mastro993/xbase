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
/** Reading the profile, plus posting for the scheduler; offline.access brings a refresh token. */
const SCOPES = ['tweet.read', 'users.read', 'tweet.write', 'offline.access'];
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

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string(),
});

/** A confidential client: the app's credentials go in a Basic header (RFC 6749 §2.3.1). */
export async function exchangeXCode(code: string, verifier: string): Promise<XTokens> {
  const { X_CLIENT_ID, X_CLIENT_SECRET } = getEnv();
  const credentials = `${encodeURIComponent(X_CLIENT_ID)}:${encodeURIComponent(X_CLIENT_SECRET)}`;
  const body = TokenResponse.parse(
    await xJson(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(),
        code_verifier: verifier,
      }),
    }),
  );
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope,
  };
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
 * saves both; a response without one keeps the stored token.
 */
export async function refreshXTokens(refreshToken: string): Promise<XTokens> {
  const { X_CLIENT_ID, X_CLIENT_SECRET } = getEnv();
  const credentials = `${encodeURIComponent(X_CLIENT_ID)}:${encodeURIComponent(X_CLIENT_SECRET)}`;
  const body = TokenResponse.parse(
    await xJson(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }),
  );
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope,
  };
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
