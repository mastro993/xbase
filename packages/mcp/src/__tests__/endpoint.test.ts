import { oauthGrants, posts } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serveMcp } from '../endpoint';
import { connectedClient } from '../oauth/__tests__/fixtures';
import { hashSecret } from '../oauth/crypto';
import { createGrant, revokeGrant, saveClient } from '../oauth/store';
import { verifyAccessToken } from '../oauth/token';

vi.mock('@xbase/server/env', () => ({
  getEnv: () => ({
    APP_URL: 'https://xbase.test',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_SECRET: 'test-client-secret',
  }),
}));

const MCP_URL = 'https://xbase.test/mcp';
const MODERN = '2026-07-28';
const META = {
  'io.modelcontextprotocol/protocolVersion': MODERN,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
};

let db: ReturnType<typeof createTestDb>;
let accessToken: string;
let grantId: string;
beforeEach(async () => {
  db = createTestDb();
  seedAccount();
  const { tokens } = await connectedClient();
  accessToken = tokens.access_token;
  grantId = db.select().from(oauthGrants).get()?.id ?? '';
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return serveMcp(
    new Request(MCP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** A 2026-07-28 request: stateless, with the protocol version on every call. */
function modern(method: string, params: Record<string, unknown> = {}, headers = {}) {
  const extra: Record<string, string> = { 'mcp-protocol-version': MODERN, 'mcp-method': method };
  if (method === 'tools/call') extra['mcp-name'] = String(params.name);
  return post(
    { jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: META } },
    { ...extra, ...headers },
  );
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await modern('tools/call', { name, arguments: args });
  expect(response.status).toBe(200);
  return (await response.json()).result;
}

describe('auth', () => {
  it('answers 401 with the metadata URL when no token is sent', async () => {
    const response = await modern('tools/list', {}, { authorization: '' });
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      'resource_metadata="https://xbase.test/.well-known/oauth-protected-resource/mcp"',
    );
    expect(challenge).toContain('scope="mcp"');
  });

  it.each([
    ['an unknown token', 'Bearer xbase_at_unknown'],
    ['an API key', `Bearer xbase_ak_${'a'.repeat(43)}`],
    ['a token in another scheme', 'Basic abc'],
  ])('answers 401 for %s', async (_, authorization) => {
    expect((await modern('tools/list', {}, { authorization })).status).toBe(401);
  });

  it('answers 401 once the grant is revoked', async () => {
    expect((await modern('tools/list')).status).toBe(200);
    revokeGrant(grantId, new Date());
    expect((await modern('tools/list')).status).toBe(401);
  });

  it('refuses tokens issued for another resource', async () => {
    const clientId = saveClient({
      clientId: 'dcr_x',
      kind: 'dcr',
      clientName: 'x',
      redirectUris: [],
    }).clientId;
    const code = { codeHash: 'h', clientId, redirectUri: 'x', codeChallenge: 'x', scope: 'mcp' };
    const expiresAt = new Date(Date.now() + 3600_000);
    const token = 'xbase_at_for-another-resource';
    createGrant(
      { ...code, resource: 'https://other.test/mcp', expiresAt, usedAt: null, grantId: null },
      {
        accessHash: hashSecret(token),
        refreshHash: 'r',
        accessExpiresAt: expiresAt,
        refreshExpiresAt: expiresAt,
      },
      new Date(),
    );
    // The token itself is live; only its resource is wrong.
    expect(verifyAccessToken(token)?.resource?.href).toBe('https://other.test/mcp');
    expect((await modern('tools/list', {}, { authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it('refuses a browser request from another origin', async () => {
    expect((await modern('tools/list', {}, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await modern('tools/list', {}, { origin: 'https://xbase.test' })).status).toBe(200);
  });
});

describe('tools', () => {
  it('lists the tools in a fixed order with their annotations', async () => {
    const response = await modern('tools/list');
    expect(response.status).toBe(200);
    const { tools } = (await response.json()).result;
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual([
      'list_drafts',
      'get_draft',
      'create_draft',
      'update_draft',
      'delete_draft',
      'schedule_post',
      'unschedule_post',
      'list_scheduled',
      'list_saved_searches',
    ]);
    const byName = Object.fromEntries(tools.map((tool: { name: string }) => [tool.name, tool]));
    expect(byName.list_drafts.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.delete_draft.annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(byName.create_draft.inputSchema.properties.parts.description).toMatch(/thread/);
    expect(byName.create_draft.outputSchema).toBeDefined();
  });

  it('creates, schedules and lists drafts with origin mcp', async () => {
    const created = await callTool('create_draft', { parts: ['Hello from MCP'] });
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent).toMatchObject({
      account: 'user1001',
      parts: ['Hello from MCP'],
      origin: 'mcp',
      status: 'draft',
    });
    expect(JSON.parse(created.content[0].text)).toEqual(created.structuredContent);
    expect(db.select().from(posts).get()?.origin).toBe('mcp');

    const id = created.structuredContent.id;
    const publishAt = new Date(Date.now() + 3600_000).toISOString();
    const scheduled = await callTool('schedule_post', { id, publishAt });
    expect(scheduled.structuredContent).toMatchObject({ status: 'scheduled', publishAt });
    const queue = await callTool('list_scheduled', {});
    expect(queue.structuredContent.items.map((item: { id: string }) => item.id)).toEqual([id]);
    expect((await callTool('list_saved_searches')).structuredContent).toEqual({ items: [] });
  });

  it('needs the account for a new draft once several are linked, and filters lists by it', async () => {
    seedAccount({ id: '2002', username: 'other' });
    const unnamed = await callTool('create_draft', { parts: ['Hello'] });
    expect(unnamed.isError).toBe(true);
    expect(unnamed.content[0].text).toBe(
      'Say which account: @user1001, @other. Fix the arguments and try again.',
    );
    expect(db.select().from(posts).all()).toEqual([]);

    const named = await callTool('create_draft', { parts: ['Hello'], account: '@other' });
    expect(named.structuredContent.account).toBe('other');
    await callTool('create_draft', { parts: ['Hi'], account: 'user1001' });

    const accounts = async (name: string, args: Record<string, unknown>) =>
      (await callTool(name, args)).structuredContent.items.map(
        (item: { account: string }) => item.account,
      );
    expect(await accounts('list_drafts', { account: 'other' })).toEqual(['other']);
    expect(new Set(await accounts('list_drafts', {}))).toEqual(new Set(['other', 'user1001']));
    const publishAt = new Date(Date.now() + 3600_000).toISOString();
    await callTool('schedule_post', { id: named.structuredContent.id, publishAt });
    expect(await accounts('list_scheduled', { account: 'user1001' })).toEqual([]);
    expect(await accounts('list_scheduled', {})).toEqual(['other']);
  });

  it('turns service errors into tool errors with a next step', async () => {
    const missing = await callTool('get_draft', { id: 'nope' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toBe(
      'Post not found. Call list_drafts or list_scheduled for current post ids.',
    );

    const invalid = await callTool('create_draft', { parts: ['  '] });
    expect(invalid.isError).toBe(true);
    expect(db.select().from(posts).all()).toEqual([]);
  });

  it('serves 2025-era clients through initialize', async () => {
    const response = await post(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      },
      { 'mcp-protocol-version': '2025-11-25' },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"name":"xbase"');
  });

  it('refuses GET: the server is stateless', async () => {
    const response = await serveMcp(
      new Request(MCP_URL, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'text/event-stream' },
      }),
    );
    expect(response.status).toBe(405);
  });
});
