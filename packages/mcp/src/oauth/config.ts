import { getEnv } from '@xbase/server/env';

// Every public URL comes from APP_URL, never from the request's Host or X-Forwarded-* headers,
// which a client or a proxy controls.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type OAuthConfig = ReturnType<typeof oauthConfig>;

/** The authorization server and the MCP endpoint it protects, both on APP_URL. */
export function oauthConfig() {
  const issuer = getEnv().APP_URL;
  return {
    issuer,
    /** The MCP endpoint, the RFC 8707 resource every token is bound to. */
    resource: `${issuer}/mcp`,
    resourceMetadataUrl: `${issuer}/.well-known/oauth-protected-resource/mcp`,
    scope: 'mcp',
    accessTokenTtlMs: 60 * MINUTE,
    refreshTokenTtlMs: 60 * DAY,
    codeTtlMs: 5 * MINUTE,
  };
}
