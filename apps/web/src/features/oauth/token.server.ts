import type { AuthInfo } from '@modelcontextprotocol/server';
import { type OAuthConfig, oauthConfig } from './config.server';
import { hashSecret, newSecret, pkceS256Matches } from './crypto.server';
import { oauthError, publicJson, readOAuthForm, requestClientId } from './http';
import { overLimit, tokenLimiter } from './rate-limit.server';
import { matchResource } from './resource';
import {
  claimCode,
  createGrant,
  findToken,
  grantOfCode,
  revokeGrant,
  rotateRefreshToken,
  type TokenPair,
  touchGrant,
} from './store.server';

// POST /oauth/token and access-token checks for /mcp. Tokens are opaque random strings; the
// database holds their sha256. A code or refresh token presented twice means it leaked, so the
// whole grant is revoked (OAuth 2.1 §4.3.1, RFC 9700 §4.14).

const ACCESS_PREFIX = 'xbase_at_';
const REFRESH_PREFIX = 'xbase_rt_';
const ONCE = ['grant_type', 'code', 'redirect_uri', 'code_verifier', 'refresh_token', 'client_id'];
// Write a grant's last_used_at at most this often, not on every MCP call.
const TOUCH_MS = 60 * 1000;

const invalidGrant = (description: string) => oauthError(400, 'invalid_grant', description);

function issueTokens(config: OAuthConfig, now: Date) {
  const access = newSecret(ACCESS_PREFIX);
  const refresh = newSecret(REFRESH_PREFIX);
  const pair: TokenPair = {
    accessHash: hashSecret(access),
    refreshHash: hashSecret(refresh),
    accessExpiresAt: new Date(now.getTime() + config.accessTokenTtlMs),
    refreshExpiresAt: new Date(now.getTime() + config.refreshTokenTtlMs),
  };
  const response = (scope: string) =>
    publicJson(
      {
        access_token: access,
        token_type: 'Bearer',
        expires_in: Math.floor(config.accessTokenTtlMs / 1000),
        refresh_token: refresh,
        scope,
      },
      200,
      // RFC 6749 §5.1, for old HTTP/1.0 caches.
      { Pragma: 'no-cache' },
    );
  return { pair, response };
}

function exchangeCode(form: URLSearchParams, clientId: string, now: Date): Response {
  const code = form.get('code');
  if (!code) return oauthError(400, 'invalid_request', 'code is required.');
  const codeHash = hashSecret(code);
  const row = claimCode(codeHash, now);
  if (!row) {
    // Unknown, or used before. A second use means the code leaked: revoke what it was exchanged for.
    const grantId = grantOfCode(codeHash);
    if (grantId) revokeGrant(grantId, now);
    return invalidGrant('The code is invalid or was already used.');
  }
  if (row.expiresAt <= now) return invalidGrant('The code expired.');
  if (row.clientId !== clientId) return invalidGrant('The code was issued to another client.');
  if (row.redirectUri !== form.get('redirect_uri')) {
    return invalidGrant('redirect_uri differs from the authorization request.');
  }
  if (!pkceS256Matches(form.get('code_verifier') ?? '', row.codeChallenge)) {
    return invalidGrant('code_verifier doesn’t match the code_challenge.');
  }
  const config = oauthConfig();
  const asked = form.getAll('resource');
  if (asked.length > 0 && matchResource(asked, config) !== row.resource) {
    return oauthError(400, 'invalid_target', `The code was issued for ${row.resource}.`);
  }
  const { pair, response } = issueTokens(config, now);
  createGrant(row, pair, now);
  return response(row.scope);
}

function refreshTokens(form: URLSearchParams, clientId: string, now: Date): Response {
  const refreshToken = form.get('refresh_token');
  if (!refreshToken) return oauthError(400, 'invalid_request', 'refresh_token is required.');
  // Every failure is invalid_grant: clients (Claude among them) then ask the owner to sign in
  // again, while other errors leave them stuck.
  const row = findToken(hashSecret(refreshToken), 'refresh');
  if (!row || row.revokedAt) return invalidGrant('The refresh token is invalid or was revoked.');
  if (row.clientId !== clientId)
    return invalidGrant('The refresh token belongs to another client.');
  if (row.rotatedAt) {
    revokeGrant(row.grantId, now);
    return invalidGrant('The refresh token was already used, so access was revoked.');
  }
  if (row.expiresAt <= now) return invalidGrant('The refresh token expired.');
  const config = oauthConfig();
  const asked = form.getAll('resource');
  if (asked.length > 0 && matchResource(asked, config) !== row.resource) {
    return invalidGrant('The grant is for another resource; authorize again.');
  }
  const { pair, response } = issueTokens(config, now);
  if (!rotateRefreshToken(row.tokenHash, row.grantId, pair, now)) {
    // Another request rotated it first: the same token was sent twice.
    revokeGrant(row.grantId, now);
    return invalidGrant('The refresh token was already used, so access was revoked.');
  }
  return response(row.scope);
}

/** POST /oauth/token: authorization_code (with PKCE) and refresh_token grants. */
export async function handleToken(request: Request, ip: string, now = new Date()) {
  if (overLimit(tokenLimiter, ip, now.getTime())) {
    return oauthError(429, 'temporarily_unavailable', 'Too many requests; try again later.', {
      'Retry-After': '60',
    });
  }
  const form = await readOAuthForm(request, ONCE);
  if (form instanceof Response) return form;
  const clientId = requestClientId(request, form);
  if (!clientId) return oauthError(400, 'invalid_request', 'client_id is required.');
  switch (form.get('grant_type')) {
    case 'authorization_code':
      return exchangeCode(form, clientId, now);
    case 'refresh_token':
      return refreshTokens(form, clientId, now);
    case null:
      return oauthError(400, 'invalid_request', 'grant_type is required.');
    default:
      return oauthError(400, 'unsupported_grant_type');
  }
}

/**
 * The access token's grant, as the MCP SDK's AuthInfo, or null when the token is unknown,
 * expired or revoked. expiresAt and resource are required by its bearer check.
 */
export function verifyAccessToken(token: string, now = new Date()): AuthInfo | null {
  if (!token.startsWith(ACCESS_PREFIX)) return null;
  const row = findToken(hashSecret(token), 'access');
  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_MS) {
    touchGrant(row.grantId, now);
  }
  return {
    token,
    clientId: row.clientId,
    scopes: row.scope.split(' '),
    expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
    resource: new URL(row.resource),
    extra: { grantId: row.grantId },
  };
}
