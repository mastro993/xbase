import { describe, expect, it, vi } from 'vitest';
import { Route as CatchAll } from '../$';
import { Route as AuthorizationServer } from '../oauth-authorization-server';
import { Route as ProtectedResource } from '../oauth-protected-resource/$';

// This folder starts with "-" so the route generator skips it.

vi.mock('@xbase/server/env', () => ({
  getEnv: () => ({
    APP_URL: 'https://xbase.test',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_SECRET: 'test-client-secret',
  }),
}));

type Handler = (ctx: { request: Request; pathname: string }) => Response | Promise<Response>;
type AnyRoute = { options: { server?: { handlers?: unknown } } };

function call(route: AnyRoute, method: string, pathname: string) {
  const handlers = (route.options.server?.handlers ?? {}) as Record<string, Handler>;
  const handler = handlers[method] ?? handlers.ANY;
  if (!handler) throw new Error(`No ${method} handler`);
  return handler({ request: new Request(`https://xbase.test${pathname}`, { method }), pathname });
}

describe('/.well-known/oauth-authorization-server', () => {
  it('describes a public-client, S256-only server with CIMD, DCR and iss', async () => {
    const response = await call(
      AuthorizationServer,
      'GET',
      '/.well-known/oauth-authorization-server',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({
      issuer: 'https://xbase.test',
      authorization_endpoint: 'https://xbase.test/oauth/authorize',
      token_endpoint: 'https://xbase.test/oauth/token',
      registration_endpoint: 'https://xbase.test/oauth/register',
      revocation_endpoint: 'https://xbase.test/oauth/revoke',
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  it('answers CORS preflights and refuses other methods', async () => {
    const preflight = await call(
      AuthorizationServer,
      'OPTIONS',
      '/.well-known/oauth-authorization-server',
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET');
    const post = await call(AuthorizationServer, 'POST', '/.well-known/oauth-authorization-server');
    expect(post.status).toBe(405);
  });
});

describe('/.well-known/oauth-protected-resource', () => {
  it.each([
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/',
  ])('serves the /mcp document at %s', async (pathname) => {
    const response = await call(ProtectedResource, 'GET', pathname);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({
      resource: 'https://xbase.test/mcp',
      authorization_servers: ['https://xbase.test'],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
      resource_name: 'XBase',
    });
  });

  it('knows no other resource', async () => {
    expect(
      (await call(ProtectedResource, 'GET', '/.well-known/oauth-protected-resource/api')).status,
    ).toBe(404);
    const other = await call(CatchAll, 'GET', '/.well-known/openid-configuration');
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: 'not_found' });
  });
});
