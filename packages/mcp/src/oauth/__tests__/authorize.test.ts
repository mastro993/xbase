import { oauthCodes } from '@xbase/db/schema';
import { createTestDb } from '@xbase/db/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAuthorizeRequest, decideConsent, startAuthorization } from '../authorize';
import { beginConsent, consentView } from '../consent';
import { hashSecret } from '../crypto';
import {
  addDcrClient,
  authorizeQuery,
  consentPost,
  ISSUER,
  pkce,
  REDIRECT_URI,
  RESOURCE,
  SESSION,
} from './fixtures';

vi.mock('@xbase/server/env', () => ({
  getEnv: () => ({
    APP_URL: 'https://xbase.test',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_SECRET: 'test-client-secret',
  }),
}));

let db: ReturnType<typeof createTestDb>;
let clientId: string;
const { challenge } = pkce();
beforeEach(() => {
  db = createTestDb();
  clientId = addDcrClient().clientId;
});

const query = (params: Record<string, string> = {}) =>
  authorizeQuery({ client_id: clientId, code_challenge: challenge, ...params });

async function okRequest() {
  const gate = await checkAuthorizeRequest(query());
  if (gate.kind !== 'ok') throw new Error('expected ok');
  return gate.request;
}

describe('checkAuthorizeRequest: before the client and redirect URI check out', () => {
  it.each([
    ['no client_id', () => query({ client_id: '' }), 'invalid_request'],
    ['no redirect_uri', () => query({ redirect_uri: '' }), 'invalid_request'],
    ['an unknown client', () => query({ client_id: 'dcr_nope' }), 'unknown_client'],
    [
      'an unregistered redirect URI',
      () => query({ redirect_uri: 'https://evil.test/cb' }),
      'invalid_redirect_uri',
    ],
    [
      'a redirect URI the policy forbids',
      () => query({ redirect_uri: 'http://evil.test/callback' }),
      'invalid_redirect_uri',
    ],
  ])('stops on its own page for %s', async (_, make, error) => {
    expect(await checkAuthorizeRequest(make())).toEqual({ kind: 'page', error });
  });

  it('never redirects to an unregistered URI, even with other errors', async () => {
    const q = query({ redirect_uri: 'https://evil.test/cb', code_challenge_method: 'plain' });
    q.set('response_type', 'token');
    expect(await checkAuthorizeRequest(q)).toEqual({ kind: 'page', error: 'invalid_redirect_uri' });
  });

  it('refuses a repeated client_id or redirect_uri', async () => {
    const twoClients = query();
    twoClients.append('client_id', clientId);
    const twoRedirects = query();
    twoRedirects.append('redirect_uri', REDIRECT_URI);
    expect(await checkAuthorizeRequest(twoClients)).toEqual({
      kind: 'page',
      error: 'invalid_request',
    });
    expect(await checkAuthorizeRequest(twoRedirects)).toEqual({
      kind: 'page',
      error: 'invalid_request',
    });
  });
});

describe('checkAuthorizeRequest: errors go back to the client, with iss', () => {
  async function redirectError(q: URLSearchParams) {
    const gate = await checkAuthorizeRequest(q);
    if (gate.kind !== 'redirect') throw new Error(`expected a redirect, got ${gate.kind}`);
    const url = new URL(gate.location);
    expect(`${url.origin}${url.pathname}`).toBe('http://127.0.0.1:53682/callback');
    expect(url.searchParams.get('iss')).toBe(ISSUER);
    return url.searchParams;
  }

  it('rejects PKCE plain', async () => {
    const params = await redirectError(query({ code_challenge_method: 'plain' }));
    expect(params.get('error')).toBe('invalid_request');
    expect(params.get('state')).toBe('state-123');
  });

  it.each([
    ['no challenge', { code_challenge: '' }],
    ['no method', { code_challenge_method: '' }],
    ['a malformed challenge', { code_challenge: 'short' }],
  ])('requires S256 PKCE: %s', async (_, params) => {
    expect((await redirectError(query(params))).get('error')).toBe('invalid_request');
  });

  it('supports only the code flow', async () => {
    const params = await redirectError(query({ response_type: 'token' }));
    expect(params.get('error')).toBe('unsupported_response_type');
  });

  it('refuses another resource', async () => {
    const params = await redirectError(query({ resource: 'https://other.test/mcp' }));
    expect(params.get('error')).toBe('invalid_target');
  });

  it('refuses a repeated state without echoing either', async () => {
    const q = query();
    q.append('state', 'other');
    const params = await redirectError(q);
    expect(params.get('error')).toBe('invalid_request');
    expect(params.has('state')).toBe(false);
  });
});

describe('checkAuthorizeRequest: a valid request', () => {
  it('matches a loopback redirect URI on any port and binds the canonical resource', async () => {
    const q = query({ scope: 'mcp offline_access' });
    q.delete('resource');
    expect(await checkAuthorizeRequest(q)).toEqual({
      kind: 'ok',
      request: {
        clientId,
        clientName: 'Cursor',
        kind: 'dcr',
        redirectUri: REDIRECT_URI,
        state: 'state-123',
        codeChallenge: challenge,
        scope: 'mcp',
        resource: RESOURCE,
      },
    });
  });
});

describe('startAuthorization (GET)', () => {
  const get = (q: URLSearchParams | string, session: string | null = SESSION) =>
    startAuthorization(new Request(`${ISSUER}/oauth/authorize?${q}`), session);

  it('leaves the consent page itself to the renderer', async () => {
    expect(await get('consent=c_abc')).toBeUndefined();
    expect(await get('error=expired')).toBeUndefined();
  });

  it('sends a signed-out visitor to sign in, without looking at the client', async () => {
    const response = await get(query({ client_id: 'https://evil.test/meta' }), null);
    expect(response?.status).toBe(303);
    const location = new URL(response?.headers.get('location') ?? '', ISSUER);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toMatch(/^\/oauth\/authorize\?/);
  });

  it('parks a valid request and moves to its consent page', async () => {
    const response = await get(query());
    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toMatch(/^\/oauth\/authorize\?consent=c_[\w-]{43}$/);
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });

  it('shows page errors on its own page', async () => {
    const response = await get(query({ client_id: 'dcr_nope' }));
    expect(response?.headers.get('location')).toBe('/oauth/authorize?error=unknown_client');
  });

  it('redirects client errors to the client', async () => {
    const response = await get(query({ code_challenge_method: 'plain' }));
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toMatch(
      /^http:\/\/127\.0\.0\.1:53682\/callback\?error=/,
    );
    expect(response?.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('decideConsent (POST)', () => {
  const NOW = new Date('2026-10-23T12:00:00.000Z');

  it('approves: a code, the state and iss go back to the app', async () => {
    const id = beginConsent(await okRequest(), SESSION, NOW.getTime());
    const response = await decideConsent(consentPost(id, 'approve'), SESSION, NOW);
    expect(response.status).toBe(303);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe('http://127.0.0.1:53682/callback');
    expect([...location.searchParams.keys()]).toEqual(['code', 'state', 'iss']);
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('iss')).toBe(ISSUER);

    const code = location.searchParams.get('code') ?? '';
    const [row] = db.select().from(oauthCodes).all();
    expect(row).toEqual({
      codeHash: hashSecret(code),
      clientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: challenge,
      scope: 'mcp',
      resource: RESOURCE,
      expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
      usedAt: null,
      grantId: null,
    });
  });

  it('denies: access_denied with the state and iss, and no code', async () => {
    const id = beginConsent(await okRequest(), SESSION);
    const response = await decideConsent(consentPost(id, 'deny'), SESSION);
    const params = new URL(response.headers.get('location') ?? '').searchParams;
    expect(params.get('error')).toBe('access_denied');
    expect(params.get('state')).toBe('state-123');
    expect(params.get('iss')).toBe(ISSUER);
    expect(db.select().from(oauthCodes).all()).toEqual([]);
  });

  it.each([
    ['no Origin', null],
    ['another origin', 'https://evil.test'],
    ['the null origin', 'null'],
  ])('refuses a form with %s', async (_, origin) => {
    const id = beginConsent(await okRequest(), SESSION);
    const response = await decideConsent(consentPost(id, 'approve', origin), SESSION);
    expect(response.status).toBe(403);
    expect(response.headers.has('location')).toBe(false);
  });

  it('needs a session', async () => {
    const id = beginConsent(await okRequest(), SESSION);
    expect((await decideConsent(consentPost(id, 'approve'), null)).status).toBe(401);
  });

  it('only answers the session that opened it, and only once', async () => {
    const expired = '/oauth/authorize?error=expired';
    const id = beginConsent(await okRequest(), SESSION);
    const other = await decideConsent(consentPost(id, 'approve'), 'other-session');
    expect(other.headers.get('location')).toBe(expired);
    // The failed attempt used it up.
    const again = await decideConsent(consentPost(id, 'approve'), SESSION);
    expect(again.headers.get('location')).toBe(expired);

    const id2 = beginConsent(await okRequest(), SESSION);
    await decideConsent(consentPost(id2, 'approve'), SESSION);
    const replay = await decideConsent(consentPost(id2, 'approve'), SESSION);
    expect(replay.headers.get('location')).toBe(expired);
  });

  it('expires after 10 minutes', async () => {
    const id = beginConsent(await okRequest(), SESSION, NOW.getTime());
    const later = new Date(NOW.getTime() + 10 * 60 * 1000);
    const response = await decideConsent(consentPost(id, 'approve'), SESSION, later);
    expect(response.headers.get('location')).toBe('/oauth/authorize?error=expired');
  });
});

describe('consentView', () => {
  it('describes a pending request to its session only', async () => {
    const id = beginConsent(await okRequest(), SESSION);
    expect(consentView({ consent: id }, SESSION)).toEqual({
      kind: 'consent',
      consentId: id,
      clientName: 'Cursor',
      verifiedHost: null,
      redirectHost: '127.0.0.1:53682',
      redirectOrigin: 'http://127.0.0.1:53682',
      loopback: true,
    });
    expect(consentView({ consent: id }, 'other-session')).toEqual({
      kind: 'error',
      error: 'expired',
    });
    expect(consentView({ consent: id }, null)).toEqual({ kind: 'error', error: 'expired' });
    expect(consentView({}, SESSION)).toEqual({ kind: 'error', error: 'expired' });
    expect(consentView({ error: 'unknown_client' }, SESSION)).toEqual({
      kind: 'error',
      error: 'unknown_client',
    });
  });
});
