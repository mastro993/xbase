import { createHash } from 'node:crypto';
import { sessions, xAccounts } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { decryptToken } from '@xbase/server/token-crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inRequest } from '@/test/request';
import { issueSession } from '../session.server';
import { finishXSignIn, startXSignIn } from '../x-oauth.server';

const env = vi.hoisted(() => ({
  APP_URL: 'https://xbase.test',
  X_CLIENT_ID: 'client-id',
  X_CLIENT_SECRET: 'client-secret',
  X_OWNER_USERNAME: undefined as string | undefined,
}));
vi.mock('@xbase/server/env', () => ({ getEnv: () => env }));

const ME = { id: '1001', username: 'owner', name: 'Owner', profile_image_url: 'https://pbs/a.jpg' };

/** X's token and users/me endpoints; `me` is who signs in. */
function mockX({ me = ME, tokenStatus = 200, refresh = true } = {}) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === 'https://api.x.com/2/oauth2/token') {
      return tokenStatus === 200
        ? Response.json({
            token_type: 'bearer',
            access_token: 'access-new',
            ...(refresh && { refresh_token: 'refresh-new' }),
            expires_in: 7200,
            scope: 'tweet.read users.read tweet.write offline.access',
          })
        : Response.json({ error: 'invalid_request' }, { status: tokenStatus });
    }
    if (url.startsWith('https://api.x.com/2/users/me')) return Response.json({ data: me });
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const cookiesFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');

/** Runs /auth/x/start in a request with `cookie`; returns X's URL and the cookie it set. */
async function start(intent: 'sign_in' | 'add' = 'sign_in', next: unknown = '/queue', cookie = '') {
  const { result, response } = await inRequest(
    new Request('https://xbase.test/auth/x/start', { headers: { cookie } }),
    () => startXSignIn({ intent, next }),
  );
  return {
    url: new URL(result),
    cookie: [cookie, cookiesFrom(response)].filter(Boolean).join('; '),
  };
}

/** X's redirect back, with the browser's cookies. */
async function callback(query: Record<string, string>, cookie: string) {
  const url = new URL(`https://xbase.test/auth/x/callback?${new URLSearchParams(query)}`);
  const { result, response } = await inRequest(new Request(url, { headers: { cookie } }), () =>
    finishXSignIn(url),
  );
  return { location: result, setCookie: response.headers.getSetCookie().join('\n') };
}

/** A whole round trip: start, consent on X, come back with a code. */
async function signIn(options: { intent?: 'sign_in' | 'add'; cookie?: string } = {}) {
  const started = await start(options.intent, '/queue', options.cookie);
  return callback(
    { code: 'the-code', state: started.url.searchParams.get('state')! },
    started.cookie,
  );
}

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  env.X_OWNER_USERNAME = undefined;
  db = createTestDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startXSignIn', () => {
  it('sends the browser to X with PKCE S256, and parks the flow in a short-lived cookie', async () => {
    const { result, response } = await inRequest(new Request('https://xbase.test/'), () =>
      startXSignIn({ intent: 'sign_in', next: '/queue' }),
    );
    const url = new URL(result);
    expect(`${url.origin}${url.pathname}`).toBe('https://x.com/i/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: 'https://xbase.test/auth/x/callback',
      scope: 'tweet.read users.read tweet.write offline.access',
      code_challenge_method: 'S256',
    });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-xbase_x_oauth=/);
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // The challenge is the verifier's hash; the verifier itself never leaves the cookie.
    const flow = JSON.parse(Buffer.from(/=([^;]+)/.exec(cookie)![1], 'base64url').toString()) as {
      verifier: string;
      state: string;
    };
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(flow.verifier).digest('base64url'),
    );
    expect(url.searchParams.get('state')).toBe(flow.state);
    expect(url.searchParams.has('code_verifier')).toBe(false);
  });
});

describe('finishXSignIn', () => {
  it('lets the first account claim an empty XBase, keeping its tokens encrypted', async () => {
    const fetch = mockX();
    const { location, setCookie } = await signIn();
    expect(location).toBe('/queue');
    expect(setCookie).toMatch(/__Host-xbase_session=[\w-]{43}/);
    const [account] = db.select().from(xAccounts).all();
    expect(account).toMatchObject({
      id: '1001',
      username: 'owner',
      avatarUrl: 'https://pbs/a.jpg',
    });
    expect(account.accessToken).not.toContain('access-new');
    expect(decryptToken(account.accessToken, '1001:access')).toBe('access-new');
    expect(decryptToken(account.refreshToken!, '1001:refresh')).toBe('refresh-new');
    expect(db.select({ accountId: sessions.accountId }).from(sessions).all()).toEqual([
      { accountId: '1001' },
    ]);
    // The app's credentials go in a Basic header, with the PKCE verifier in the body.
    const [, init] = fetch.mock.calls[0];
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(new URLSearchParams(init?.body as URLSearchParams).get('code_verifier')).toMatch(
      /^[\w-]{43}$/,
    );
  });

  it('signs a linked account in and refreshes its profile', async () => {
    seedAccount({ id: '1001', username: 'old_name' });
    mockX();
    const { location, setCookie } = await signIn();
    expect(location).toBe('/queue');
    expect(setCookie).toContain('__Host-xbase_session=');
    expect(db.select({ username: xAccounts.username }).from(xAccounts).all()).toEqual([
      { username: 'owner' },
    ]);
  });

  it('keeps the stored refresh token when X answers without one', async () => {
    mockX();
    await signIn();
    mockX({ refresh: false });
    await signIn();
    const [account] = db.select().from(xAccounts).all();
    expect(decryptToken(account.refreshToken!, '1001:refresh')).toBe('refresh-new');
  });

  it('lets only X_OWNER_USERNAME claim an empty XBase, when it’s set', async () => {
    env.X_OWNER_USERNAME = 'owner';
    mockX({ me: { ...ME, id: '6666', username: 'early_bird' } });
    await expect(signIn()).resolves.toMatchObject({
      location: '/login?error=not_owner&next=%2Fqueue',
    });
    expect(db.select().from(xAccounts).all()).toEqual([]);

    mockX({ me: { ...ME, username: 'Owner' } });
    await expect(signIn()).resolves.toMatchObject({ location: '/queue' });
  });

  it('turns away an account that isn’t linked once another owns XBase', async () => {
    seedAccount({ id: '1001' });
    mockX({ me: { ...ME, id: '6666', username: 'stranger' } });
    const { location, setCookie } = await signIn();
    expect(location).toBe('/login?error=not_linked&next=%2Fqueue');
    expect(setCookie).not.toContain('xbase_session=');
    expect(db.select({ id: xAccounts.id }).from(xAccounts).all()).toEqual([{ id: '1001' }]);
  });

  it('links another account to a signed-in browser and switches to it', async () => {
    const owner = seedAccount({ id: '1001' });
    const { response } = await inRequest(new Request('https://xbase.test/'), () =>
      issueSession(owner),
    );
    mockX({ me: { ...ME, id: '2002', username: 'brand' } });
    const { location } = await signIn({ intent: 'add', cookie: cookiesFrom(response) });
    expect(location).toBe('/queue');
    expect(db.select({ id: xAccounts.id }).from(xAccounts).all()).toHaveLength(2);
    expect(db.select({ accountId: sessions.accountId }).from(sessions).all()).toEqual([
      { accountId: '2002' },
    ]);
  });

  it('treats adding without a session as signing in', async () => {
    seedAccount({ id: '1001' });
    mockX({ me: { ...ME, id: '2002' } });
    await expect(signIn({ intent: 'add' })).resolves.toMatchObject({
      location: '/login?error=not_linked&next=%2Fqueue',
    });
  });

  it('rejects a state that doesn’t match, or a flow from another browser', async () => {
    const fetch = mockX();
    const started = await start();
    await expect(callback({ code: 'c', state: 'forged' }, started.cookie)).resolves.toMatchObject({
      location: '/login?error=expired&next=%2Fqueue',
    });
    await expect(
      callback({ code: 'c', state: started.url.searchParams.get('state')! }, ''),
    ).resolves.toMatchObject({ location: '/login?error=expired' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clears the flow cookie, so a callback can’t be replayed', async () => {
    mockX();
    const started = await start();
    const { setCookie } = await callback(
      { code: 'c', state: started.url.searchParams.get('state')! },
      started.cookie,
    );
    expect(setCookie).toMatch(/__Host-xbase_x_oauth=;.*Max-Age=0/);
  });

  it('reports a cancelled consent, and X failing, without signing in', async () => {
    mockX({ tokenStatus: 400 });
    const started = await start('sign_in', '/');
    await expect(
      callback(
        { error: 'access_denied', state: started.url.searchParams.get('state')! },
        started.cookie,
      ),
    ).resolves.toMatchObject({ location: '/login?error=denied' });

    const again = await start('sign_in', '/');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { location, setCookie } = await callback(
      { code: 'c', state: again.url.searchParams.get('state')! },
      again.cookie,
    );
    expect(location).toBe('/login?error=failed');
    expect(setCookie).not.toContain('xbase_session=');
    expect(db.select().from(xAccounts).all()).toEqual([]);
  });

  it('keeps `next` on the site', async () => {
    mockX();
    const started = await start('sign_in', '//evil.example/');
    await expect(
      callback({ code: 'c', state: started.url.searchParams.get('state')! }, started.cookie),
    ).resolves.toMatchObject({ location: '/' });
  });
});
