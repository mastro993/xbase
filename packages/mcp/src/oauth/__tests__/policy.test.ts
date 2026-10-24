import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { allowedRedirectUris, cleanClientName } from '../client-metadata';
import { hashSecret, newSecret, pkceS256Matches } from '../crypto';
import { isLoopbackUri, redirectAllowed, redirectMatches } from '../redirect-uri';
import { matchResource } from '../resource';
import { pkce } from './fixtures';

describe('redirectAllowed', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://chatgpt.com/connector_platform_oauth_redirect?x=1',
    'http://localhost:8787/callback',
    'http://127.0.0.1/callback',
    'http://[::1]:33418/',
  ])('allows %s', (uri) => {
    expect(redirectAllowed(uri)).toBe(true);
  });

  it.each([
    'http://example.com/callback',
    'http://localhost.evil.com/callback',
    'http://127.0.0.1.nip.io/callback',
    'cursor://anysphere.cursor-mcp/oauth/callback',
    'javascript:alert(1)',
    'https://claude.ai/cb#frag',
    'https://claude.ai/cb#',
    'https://user:pass@claude.ai/cb',
    'http://localhost@evil.com/cb',
    'not a url',
    '',
  ])('refuses %s', (uri) => {
    expect(redirectAllowed(uri)).toBe(false);
  });
});

describe('redirectMatches', () => {
  it.each([
    ['https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback'],
    ['http://127.0.0.1/callback', 'http://127.0.0.1:53682/callback'],
    ['http://localhost/callback', 'http://localhost:61234/callback'],
    ['http://localhost:8787/callback', 'http://localhost:5000/callback'],
    ['http://[::1]:33418/', 'http://[::1]:40000/'],
    ['http://127.0.0.1/cb?app=x', 'http://127.0.0.1:9/cb?app=x'],
  ])('matches %s with %s', (registered, requested) => {
    expect(redirectMatches(registered, requested)).toBe(true);
  });

  it.each([
    // Exact for https: no port, slash, case or encoding leeway.
    ['https://claude.ai/cb', 'https://claude.ai:8443/cb'],
    ['https://claude.ai/cb', 'https://claude.ai/cb/'],
    ['https://claude.ai/cb', 'https://Claude.ai/cb'],
    ['https://claude.ai/a%2Fb', 'https://claude.ai/a/b'],
    // Loopback: any port, but the same host, path and query.
    ['http://localhost/callback', 'http://127.0.0.1:5000/callback'],
    ['http://127.0.0.1/callback', 'http://127.0.0.1:5000/callback/'],
    ['http://127.0.0.1/callback', 'http://127.0.0.1:5000/other'],
    ['http://127.0.0.1/cb?a=1', 'http://127.0.0.1:5000/cb?a=2'],
    ['http://localhost/callback', 'https://localhost:5000/callback'],
    ['http://localhost/callback', 'http://localhost.evil.com:5000/callback'],
  ])('does not match %s with %s', (registered, requested) => {
    expect(redirectMatches(registered, requested)).toBe(false);
  });

  it('tells loopback URIs apart', () => {
    expect(isLoopbackUri('http://localhost:1/x')).toBe(true);
    expect(isLoopbackUri('https://localhost/x')).toBe(false);
    expect(isLoopbackUri('https://claude.ai/x')).toBe(false);
  });
});

describe('matchResource', () => {
  const config = { issuer: 'https://xbase.test', resource: 'https://xbase.test/mcp' };

  it.each([
    [[]],
    [['https://xbase.test/mcp']],
    [['https://xbase.test/mcp/']],
    [['https://XBASE.test/mcp']],
    [['https://xbase.test:443/mcp']],
    [['https://xbase.test']],
    [['https://xbase.test/']],
    [['https://xbase.test/mcp', 'https://xbase.test']],
  ])('maps %j to the MCP endpoint', (values) => {
    expect(matchResource(values, config)).toBe('https://xbase.test/mcp');
  });

  it.each([
    [['https://evil.test/mcp']],
    [['http://xbase.test/mcp']],
    [['https://xbase.test/other']],
    [['https://xbase.test/mcp?x=1']],
    [['https://xbase.test/mcp#x']],
    [['not a url']],
    [['https://xbase.test/mcp', 'https://evil.test/mcp']],
  ])('refuses %j', (values) => {
    expect(matchResource(values, config)).toBeNull();
  });
});

describe('PKCE', () => {
  it('accepts the S256 pair', () => {
    const { verifier, challenge } = pkce();
    expect(pkceS256Matches(verifier, challenge)).toBe(true);
  });

  it('rejects plain: the verifier sent as its own challenge', () => {
    const { verifier } = pkce();
    expect(pkceS256Matches(verifier, verifier)).toBe(false);
  });

  it.each(['a'.repeat(42), 'a'.repeat(129), `${'a'.repeat(43)}!`])(
    'rejects the verifier %s, outside RFC 7636, even with its own S256 challenge',
    (verifier) => {
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      expect(pkceS256Matches(verifier, challenge)).toBe(false);
    },
  );

  it('makes prefixed 256-bit secrets and stores only their sha256', () => {
    expect(newSecret('xbase_at_')).toMatch(/^xbase_at_[\w-]{43}$/);
    expect(hashSecret('x')).toMatch(/^[\da-f]{64}$/);
  });
});

describe('client metadata', () => {
  it('keeps allowed redirect URIs once each, at most 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://app.test/cb${i}`);
    expect(
      allowedRedirectUris([
        'cursor://anysphere.cursor-mcp/oauth/callback',
        'http://localhost:8787/callback',
        'http://localhost:8787/callback',
        'http://example.com/cb',
      ]),
    ).toEqual(['http://localhost:8787/callback']);
    expect(allowedRedirectUris(many)).toHaveLength(10);
  });

  it('cleans self-declared names', () => {
    expect(cleanClientName('  Claude‮\n Code  ')).toBe('Claude Code');
    expect(cleanClientName('x'.repeat(150))).toHaveLength(100);
    expect(cleanClientName(' \n ')).toBeNull();
    expect(cleanClientName(undefined)).toBeNull();
  });
});
