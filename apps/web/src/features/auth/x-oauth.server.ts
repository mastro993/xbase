import { createHash, randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  accountExists,
  listAccounts,
  saveAccount,
  type XProfile,
  type XTokens,
} from '@/features/accounts/accounts.server';
import { getEnv } from '@/server/env.server';
import { type SignInError, safeNext } from './auth.schema';
import { issueSession, readSession, setSessionAccount } from './session.server';

// Signing in with X: OAuth 2.0 authorization code with PKCE, through the owner's X app
// (X_CLIENT_ID, X_CLIENT_SECRET). The same flow adds an account from Settings. The first account
// to sign in claims this XBase; after that only linked accounts can sign in.

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me?user.fields=profile_image_url';
/** Reading the profile, plus posting for the scheduler; offline.access brings a refresh token. */
const SCOPES = ['tweet.read', 'users.read', 'tweet.write', 'offline.access'];
const FLOW_TTL_S = 10 * 60;
const TIMEOUT_MS = 15_000;

/** sign_in: from /login. add: from Settings, linking another account to a signed-in browser. */
export type SignInIntent = 'sign_in' | 'add';

const Flow = z.object({
  state: z.string(),
  verifier: z.string(),
  intent: z.enum(['sign_in', 'add']),
  next: z.string(),
});
type Flow = z.infer<typeof Flow>;

/** The callback X redirects to; register it in the X app as well. */
export const callbackUrl = () => `${getEnv().APP_URL}/auth/x/callback`;

/** Like the session cookie: `__Host-` and Secure over HTTPS. Lax, so X's redirect carries it. */
function flowCookie() {
  const secure = new URL(getEnv().APP_URL).protocol === 'https:';
  return {
    name: secure ? '__Host-xbase_x_oauth' : 'xbase_x_oauth',
    options: { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const,
  };
}

/** Takes the pending flow out of its cookie: a flow is used once. */
function takeFlow(): Flow | null {
  const { name, options } = flowCookie();
  const raw = getCookie(name);
  if (!raw) return null;
  deleteCookie(name, options);
  try {
    const parsed = Flow.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Starts a sign-in: parks state and the PKCE verifier in a short-lived cookie and returns X's
 * authorization URL. Adding an account needs a session; without one it's a plain sign-in.
 */
export function startXSignIn({ intent, next }: { intent: SignInIntent; next: unknown }): string {
  const flow: Flow = {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    intent: intent === 'add' && readSession() ? 'add' : 'sign_in',
    next: safeNext(next),
  };
  const { name, options } = flowCookie();
  setCookie(name, Buffer.from(JSON.stringify(flow)).toString('base64url'), {
    ...options,
    maxAge: FLOW_TTL_S,
  });
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: getEnv().X_CLIENT_ID,
    redirect_uri: callbackUrl(),
    scope: SCOPES.join(' '),
    state: flow.state,
    code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
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
async function exchangeCode(code: string, verifier: string): Promise<XTokens> {
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

async function fetchProfile(accessToken: string): Promise<XProfile> {
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

const withQuery = (path: string, query: Record<string, string>) =>
  `${path}?${new URLSearchParams(query)}`;

/**
 * Finishes a sign-in on X's redirect and returns where to send the browser: the page it came
 * from, or back to /login (or Settings, when adding) with an error.
 */
export async function finishXSignIn(url: URL): Promise<string> {
  const flow = takeFlow();
  const session = flow?.intent === 'add' ? readSession() : null;
  const fail = (error: SignInError) =>
    session
      ? withQuery('/settings', { accountError: error })
      : withQuery('/login', { error, ...(flow && flow.next !== '/' && { next: flow.next }) });

  const query = url.searchParams;
  if (!flow || query.get('state') !== flow.state) return fail('expired');
  if (query.get('error')) return fail(query.get('error') === 'access_denied' ? 'denied' : 'failed');
  const code = query.get('code');
  if (!code) return fail('failed');

  let profile: XProfile;
  let tokens: XTokens;
  try {
    tokens = await exchangeCode(code, flow.verifier);
    profile = await fetchProfile(tokens.accessToken);
  } catch (error) {
    console.error('[auth] X sign-in failed', error);
    return fail('failed');
  }

  if (session) {
    saveAccount(profile, tokens);
    setSessionAccount(session.id, profile.id);
    return flow.next;
  }
  // The first account claims this XBase; after that, only linked accounts get in.
  if (!accountExists(profile.id) && listAccounts().length > 0) return fail('not_linked');
  saveAccount(profile, tokens);
  issueSession(profile.id);
  return flow.next;
}
