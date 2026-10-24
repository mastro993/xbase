import { randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import { type SignInError, safeNext } from '@xbase/core/auth';
import { saveAccount, type XProfile, type XTokens } from '@xbase/server/accounts';
import { getEnv } from '@xbase/server/env';
import { setSessionAccount } from '@xbase/server/sessions';
import { exchangeXCode, fetchXProfile, signInRefusal, xAuthorizeUrl } from '@xbase/server/x-auth';
import { z } from 'zod';
import { issueSession, readSession } from './session.server';

// The browser side of signing in with X (x-auth.ts in @xbase/server talks to X): the flow's state
// and PKCE verifier wait in a cookie between /auth/x/start and X's redirect to /auth/x/callback.
// The same flow adds an account from Settings.

const FLOW_TTL_S = 10 * 60;

/** sign_in: from /login. add: from Settings, linking another account to a signed-in browser. */
export type SignInIntent = 'sign_in' | 'add';

const Flow = z.object({
  state: z.string(),
  verifier: z.string(),
  intent: z.enum(['sign_in', 'add']),
  next: z.string(),
});
type Flow = z.infer<typeof Flow>;

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
  return xAuthorizeUrl(flow);
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
    tokens = await exchangeXCode(code, flow.verifier);
    profile = await fetchXProfile(tokens.accessToken);
  } catch (error) {
    console.error('[auth] X sign-in failed', error);
    return fail('failed');
  }

  if (session) {
    saveAccount(profile, tokens);
    setSessionAccount(session.id, profile.id);
    return flow.next;
  }
  const refusal = signInRefusal(profile);
  if (refusal) return fail(refusal);
  saveAccount(profile, tokens);
  issueSession(profile.id);
  return flow.next;
}
