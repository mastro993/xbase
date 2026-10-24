import { lookup } from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oauthClients } from '@/server/db/schema';
import { createTestDb } from '@/test/db';
import { isPublicAddress } from '../cimd.server';
import { findClient, handleRegister } from '../clients.server';

vi.mock('@/server/env.server', () => ({
  getEnv: () => ({
    APP_URL: 'https://xbase.test',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_SECRET: 'test-client-secret',
  }),
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

const NOW = new Date('2026-10-23T12:00:00.000Z');
const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const CLAUDE_DOC = {
  client_id: CLAUDE,
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_method: 'none',
};

const fetchMock = vi.fn<typeof fetch>();
const lookupMock = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;
let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  db = createTestDb();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '160.79.104.10', family: 4 }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const serve = (body: unknown, init?: ResponseInit) =>
  fetchMock.mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), init),
  );

describe('handleRegister (DCR)', () => {
  let ip = 0;
  const register = (body: unknown) =>
    handleRegister(
      new Request('https://xbase.test/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      `10.0.0.${(ip += 1)}`,
      NOW,
    );

  it('registers a public client with the redirect URIs the policy allows', async () => {
    const response = await register({
      client_name: 'Cursor',
      redirect_uris: [
        'cursor://anysphere.cursor-mcp/oauth/callback',
        'https://www.cursor.com/agents/mcp/oauth/callback',
        'http://localhost:8787/callback',
        'http://example.com/callback',
      ],
      token_endpoint_auth_method: 'client_secret_basic',
      application_type: 'native',
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const body = await response.json();
    expect(body).toEqual({
      client_id: expect.stringMatching(/^dcr_[\w-]{22}$/),
      client_id_issued_at: Math.floor(NOW.getTime() / 1000),
      client_name: 'Cursor',
      redirect_uris: [
        'https://www.cursor.com/agents/mcp/oauth/callback',
        'http://localhost:8787/callback',
      ],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
    expect(await findClient(body.client_id)).toMatchObject({
      kind: 'dcr',
      clientName: 'Cursor',
      redirectUris: body.redirect_uris,
    });
  });

  it('names a client that sends no name', async () => {
    const body = await (await register({ redirect_uris: ['http://127.0.0.1/cb'] })).json();
    expect(body.client_name).toBe('MCP client');
  });

  it.each([
    [
      'no valid redirect URI',
      { redirect_uris: ['http://evil.test/cb', 'cursor://x/cb'] },
      'invalid_redirect_uri',
    ],
    ['no redirect URIs at all', { client_name: 'x' }, 'invalid_client_metadata'],
    ['a javascript: URI', { redirect_uris: ['javascript:alert(1)'] }, 'invalid_client_metadata'],
    ['a body that is not JSON', 'nope', 'invalid_client_metadata'],
  ])('refuses %s', async (_, body, error) => {
    const response = await register(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(db.select().from(oauthClients).all()).toEqual([]);
  });

  it('limits registrations per IP', async () => {
    const request = () =>
      handleRegister(
        new Request('https://xbase.test/oauth/register', { method: 'POST', body: '{}' }),
        'flood',
        NOW,
      );
    const allowed = await Promise.all(Array.from({ length: 20 }, request));
    expect(allowed.map(({ status }) => status)).toEqual(Array(20).fill(400));
    expect((await request()).status).toBe(429);
  });
});

describe('findClient', () => {
  it('finds DCR clients by id only', async () => {
    expect(await findClient('dcr_unknown')).toBeNull();
    expect(await findClient('')).toBeNull();
  });

  it('fetches a CIMD document once an hour, without following redirects', async () => {
    serve(CLAUDE_DOC);
    const client = await findClient(CLAUDE, NOW);
    expect(client).toMatchObject({
      clientId: CLAUDE,
      kind: 'cimd',
      clientName: 'Claude',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      fetchedAt: NOW,
    });
    expect(lookupMock).toHaveBeenCalledWith('claude.ai', { all: true, verbatim: true });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(CLAUDE),
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    );

    await findClient(CLAUDE, new Date(NOW.getTime() + 59 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    serve({ ...CLAUDE_DOC, client_name: 'Claude (new)' });
    const refreshed = await findClient(CLAUDE, new Date(NOW.getTime() + 61 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed?.clientName).toBe('Claude (new)');
    expect(db.select().from(oauthClients).all()).toHaveLength(1);
  });

  it('accepts a document that declares another auth method (ChatGPT)', async () => {
    const id = 'https://chatgpt.com/oauth/client.json';
    serve({
      client_id: id,
      client_name: 'ChatGPT',
      redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
      token_endpoint_auth_method: 'private_key_jwt',
      jwks_uri: 'https://chatgpt.com/oauth/jwks.json',
    });
    expect((await findClient(id, NOW))?.clientName).toBe('ChatGPT');
  });

  it('refuses a document whose client_id is not its own URL', async () => {
    serve({ ...CLAUDE_DOC, client_id: 'https://claude.ai/oauth/other' });
    expect(await findClient(CLAUDE, NOW)).toBeNull();
    serve(CLAUDE_DOC);
    expect(await findClient('https://evil.test/claude-copy', NOW)).toBeNull();
    expect(db.select().from(oauthClients).all()).toEqual([]);
  });

  it.each([
    ['10.0.0.5'],
    ['127.0.0.1'],
    ['169.254.169.254'],
    ['192.168.1.20'],
    ['100.64.0.1'],
    ['::1'],
    ['fd00::1'],
    ['fe80::1'],
    ['::ffff:127.0.0.1'],
    ['64:ff9b::a00:1'],
  ])('refuses a host that resolves to %s, without fetching', async (address) => {
    lookupMock.mockResolvedValue([
      { address: '160.79.104.10', family: 4 },
      { address, family: address.includes(':') ? 6 : 4 },
    ]);
    serve(CLAUDE_DOC);
    expect(await findClient(CLAUDE, NOW)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['https://127.0.0.1/meta', 'https://[::1]/meta', 'https://10.1.2.3/meta'])(
    'refuses the private IP literal %s',
    async (id) => {
      serve({ ...CLAUDE_DOC, client_id: id });
      expect(await findClient(id, NOW)).toBeNull();
      expect(lookupMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://claude.ai',
    'https://claude.ai/',
    'https://claude.ai/meta#x',
    'https://user@claude.ai/meta',
    'https://CLAUDE.ai/meta',
    'https://claude.ai/a/../meta',
    'https://claude.ai:443/meta',
  ])('refuses the client_id %s without any request', async (id) => {
    expect(await findClient(id, NOW)).toBeNull();
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses unreachable, redirecting, failing, oversized or useless documents', async () => {
    lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    expect(await findClient(CLAUDE, NOW)).toBeNull();

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed: redirect'));
    expect(await findClient(CLAUDE, NOW)).toBeNull();

    serve(CLAUDE_DOC, { status: 404 });
    expect(await findClient(CLAUDE, NOW)).toBeNull();

    serve({ ...CLAUDE_DOC, padding: 'x'.repeat(70 * 1024) });
    expect(await findClient(CLAUDE, NOW)).toBeNull();

    serve('{ not json');
    expect(await findClient(CLAUDE, NOW)).toBeNull();

    serve({ ...CLAUDE_DOC, redirect_uris: ['http://evil.test/cb'] });
    expect(await findClient(CLAUDE, NOW)).toBeNull();

    expect(db.select().from(oauthClients).all()).toEqual([]);
  });
});

describe('isPublicAddress', () => {
  it.each(['160.79.104.10', '8.8.8.8', '2606:4700::1111', '2a00:1450:4001::200e'])(
    'accepts %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    '0.0.0.0',
    '172.16.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '2001:db8::1',
    '2002:a00:1::',
    'ff02::1',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});
