import { oauthConfig } from './config.server';

// The discovery documents MCP clients read before anything else.

/** RFC 8414 authorization server metadata, at /.well-known/oauth-authorization-server. */
export function authorizationServerMetadata() {
  const { issuer, scope } = oauthConfig();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    // Deprecated by MCP 2026-07-28, but Cursor and MCP Inspector still register this way.
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // Clients must refuse a server that doesn't list S256.
    code_challenge_methods_supported: ['S256'],
    // Public clients only. Claude uses CIMD only when `none` is listed here.
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    // No offline_access: clients would add it to every request.
    scopes_supported: [scope],
    client_id_metadata_document_supported: true,
    // RFC 9207: every authorization response carries iss. ChatGPT needs it.
    authorization_response_iss_parameter_supported: true,
  };
}

/** RFC 9728 protected resource metadata for /mcp. */
export function protectedResourceMetadata() {
  const { issuer, resource, scope } = oauthConfig();
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [scope],
    bearer_methods_supported: ['header'],
    resource_name: 'XBase',
  };
}
