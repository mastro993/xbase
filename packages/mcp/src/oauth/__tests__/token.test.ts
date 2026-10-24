import { oauthGrants, oauthTokens } from '@xbase/db/schema';
import { createTestDb } from '@xbase/db/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRevoke } from '../revoke';
import { handleToken, verifyAccessToken } from '../token';
import {
  addDcrClient,
  authorizationCode,
  connectedClient,
  ISSUER,
  REDIRECT_URI,
  RESOURCE,
  type TokenBody,
  tokenRequest,
} from './fixtures';

vi.mock('@xbase/server/env', () => ({
  getEnv: () => ({
    APP_URL: 'https://xbase.test',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_SECRET: 'test-client-secret',
  }),
}));

const NOW = new Date('2026-10-23T12:00:00.000Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);
const MINUTE = 60 * 1000;

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  db = createTestDb();
});

const token = (params: Record<string, string>, now = NOW, contentType?: string) =>
  handleToken(tokenRequest(params, contentType), 'test', now);

/** `<status> <error>` of an OAuth error answer, which is never cached. */
async function errorOf(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  return `${response.status} ${(await response.json()).error}`;
}

async function exchangeParams(now = NOW) {
  const client = addDcrClient();
  const { code, verifier } = await authorizationCode(client.clientId, now);
  return {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    resource: RESOURCE,
  };
}

const grantRevoked = () => db.select().from(oauthGrants).get()?.revokedAt instanceof Date;

describe('authorization_code', () => {
  it('issues a token pair bound to the client and the resource', async () => {
    const params = await exchangeParams();
    const response = await token(params);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await response.json()) as TokenBody;
    expect(body).toEqual({
      access_token: expect.stringMatching(/^xbase_at_[\w-]{43}$/),
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: expect.stringMatching(/^xbase_rt_[\w-]{43}$/),
      scope: 'mcp',
    });
    expect(verifyAccessToken(body.access_token, NOW)).toEqual({
      token: body.access_token,
      clientId: params.client_id,
      scopes: ['mcp'],
      expiresAt: Math.floor(later(60 * MINUTE).getTime() / 1000),
      resource: new URL(RESOURCE),
      extra: { grantId: expect.any(String) },
    });
    // Only hashes are stored.
    const stored = JSON.stringify(db.select().from(oauthTokens).all());
    expect(stored).not.toContain(body.access_token);
    expect(stored).not.toContain(body.refresh_token);
  });

  it('revokes the grant when a code is replayed', async () => {
    const params = await exchangeParams();
    const first = (await (await token(params)).json()) as TokenBody;
    expect(await errorOf(await token(params))).toBe('400 invalid_grant');
    expect(grantRevoked()).toBe(true);
    expect(verifyAccessToken(first.access_token, NOW)).toBeNull();
    const refresh = { grant_type: 'refresh_token', refresh_token: first.refresh_token };
    expect(await errorOf(await token({ ...refresh, client_id: params.client_id }))).toBe(
      '400 invalid_grant',
    );
  });

  it('refuses an expired code', async () => {
    const params = await exchangeParams();
    expect(await errorOf(await token(params, later(5 * MINUTE)))).toBe('400 invalid_grant');
  });

  it.each([
    ['another verifier', { code_verifier: 'x'.repeat(43) }],
    ['no verifier', { code_verifier: '' }],
    ['another redirect_uri', { redirect_uri: 'http://127.0.0.1:9999/callback' }],
    ['another client', { client_id: 'dcr_someone_else' }],
    ['an unknown code', { code: 'nope' }],
  ])('refuses %s', async (_, override) => {
    expect(await errorOf(await token({ ...(await exchangeParams()), ...override }))).toBe(
      '400 invalid_grant',
    );
  });

  it('refuses PKCE plain: the challenge sent back as the verifier', async () => {
    const client = addDcrClient();
    const { code, challenge } = await authorizationCode(client.clientId, NOW);
    const params = { code, code_verifier: challenge, client_id: client.clientId };
    expect(
      await errorOf(
        await token({ grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, ...params }),
      ),
    ).toBe('400 invalid_grant');
  });

  it('refuses a code used for another resource, and accepts the origin alias', async () => {
    expect(
      await errorOf(
        await token({ ...(await exchangeParams()), resource: 'https://other.test/mcp' }),
      ),
    ).toBe('400 invalid_target');
    expect((await token({ ...(await exchangeParams()), resource: ISSUER })).status).toBe(200);
  });

  it('accepts a client_id sent with HTTP Basic', async () => {
    const { client_id: clientId, ...params } = await exchangeParams();
    const request = tokenRequest(params);
    request.headers.set('authorization', `Basic ${btoa(`${clientId}:`)}`);
    expect((await handleToken(request, 'test', NOW)).status).toBe(200);
  });
});

describe('request checks', () => {
  it('accepts only form-urlencoded bodies', async () => {
    const params = await exchangeParams();
    expect(await errorOf(await token(params, NOW, 'application/json'))).toBe('400 invalid_request');
  });

  it('refuses repeated parameters', async () => {
    const params = await exchangeParams();
    const request = tokenRequest(params);
    const body = `${new URLSearchParams(params)}&code=other`;
    const repeated = new Request(request.url, { method: 'POST', headers: request.headers, body });
    expect(await errorOf(await handleToken(repeated, 'test', NOW))).toBe('400 invalid_request');
  });

  it('names a missing or unknown grant type', async () => {
    expect(await errorOf(await token({ client_id: 'x' }))).toBe('400 invalid_request');
    expect(await errorOf(await token({ client_id: 'x', grant_type: 'password' }))).toBe(
      '400 unsupported_grant_type',
    );
    expect(await errorOf(await token({ grant_type: 'refresh_token' }))).toBe('400 invalid_request');
  });

  it('limits requests per IP', async () => {
    const flood = () => handleToken(tokenRequest({}), 'flood', NOW);
    // Each call counts before its first await, so parallel calls count in order.
    const allowed = await Promise.all(Array.from({ length: 120 }, flood));
    expect(allowed.map(({ status }) => status)).toEqual(Array(120).fill(400));
    expect(await errorOf(await flood())).toBe('429 temporarily_unavailable');
  });
});

describe('refresh_token', () => {
  const refresh = (
    tokens: TokenBody,
    clientId: string,
    extra: Record<string, string> = {},
    now = NOW,
  ) =>
    token(
      {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
        ...extra,
      },
      now,
    );

  it('rotates: a new pair, and the old refresh token is dead', async () => {
    const { client, tokens } = await connectedClient(NOW);
    const response = await refresh(tokens, client.clientId, { resource: RESOURCE }, later(MINUTE));
    expect(response.status).toBe(200);
    const next = (await response.json()) as TokenBody;
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect(verifyAccessToken(next.access_token, later(MINUTE))?.clientId).toBe(client.clientId);
    expect(db.select().from(oauthGrants).get()?.lastUsedAt).toEqual(later(MINUTE));
  });

  it('revokes the grant when a refresh token is reused', async () => {
    const { client, tokens } = await connectedClient(NOW);
    const next = (await (await refresh(tokens, client.clientId)).json()) as TokenBody;
    expect(await errorOf(await refresh(tokens, client.clientId))).toBe('400 invalid_grant');
    expect(grantRevoked()).toBe(true);
    expect(verifyAccessToken(next.access_token, NOW)).toBeNull();
    expect(await errorOf(await refresh(next, client.clientId))).toBe('400 invalid_grant');
  });

  it('answers invalid_grant, not invalid_target, for another resource', async () => {
    const { client, tokens } = await connectedClient(NOW);
    expect(
      await errorOf(await refresh(tokens, client.clientId, { resource: 'https://other.test/mcp' })),
    ).toBe('400 invalid_grant');
    // Not a theft signal: the token still works.
    expect((await refresh(tokens, client.clientId)).status).toBe(200);
  });

  it('refuses another client, an expired token and an unknown one', async () => {
    const { client, tokens } = await connectedClient(NOW);
    expect(await errorOf(await refresh(tokens, 'dcr_other'))).toBe('400 invalid_grant');
    expect(
      await errorOf(await refresh(tokens, client.clientId, {}, later(61 * 24 * 60 * MINUTE))),
    ).toBe('400 invalid_grant');
    expect(
      await errorOf(await refresh({ ...tokens, refresh_token: 'xbase_rt_nope' }, client.clientId)),
    ).toBe('400 invalid_grant');
    expect(grantRevoked()).toBe(false);
  });
});

describe('verifyAccessToken', () => {
  it('refuses expired, revoked, unknown and foreign tokens', async () => {
    const { tokens } = await connectedClient(NOW);
    expect(verifyAccessToken(tokens.access_token, later(60 * MINUTE))).toBeNull();
    expect(verifyAccessToken('xbase_at_unknown', NOW)).toBeNull();
    expect(verifyAccessToken(tokens.refresh_token, NOW)).toBeNull();
    expect(verifyAccessToken(`xbase_ak_${'a'.repeat(43)}`, NOW)).toBeNull();
    db.update(oauthGrants).set({ revokedAt: NOW }).run();
    expect(verifyAccessToken(tokens.access_token, NOW)).toBeNull();
  });
});

describe('revocation (RFC 7009)', () => {
  const revoke = (params: Record<string, string>) =>
    handleRevoke(
      new Request(`${ISSUER}/oauth/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      }),
      NOW,
    );

  it('revokes the grant of either token and always answers 200', async () => {
    const { client, tokens } = await connectedClient(NOW);
    const unknown = await revoke({ token: 'xbase_rt_unknown' });
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toBe('');
    expect(grantRevoked()).toBe(false);

    // A client may only revoke its own tokens.
    expect((await revoke({ token: tokens.refresh_token, client_id: 'dcr_other' })).status).toBe(
      200,
    );
    expect(grantRevoked()).toBe(false);

    expect((await revoke({ token: tokens.refresh_token, client_id: client.clientId })).status).toBe(
      200,
    );
    expect(grantRevoked()).toBe(true);
    expect(verifyAccessToken(tokens.access_token, NOW)).toBeNull();
  });

  it('needs a token', async () => {
    expect(await errorOf(await revoke({}))).toBe('400 invalid_request');
  });
});
