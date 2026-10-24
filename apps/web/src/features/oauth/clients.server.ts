import { randomBytes } from 'node:crypto';
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/core';
import type { OAuthClient } from '@/server/db/schema';
import { cimdUrl, fetchClientMetadata } from './cimd.server';
import { allowedRedirectUris, cleanClientName } from './client-metadata';
import { oauthError, publicJson, readCapped } from './http';
import { overLimit, registerLimiter } from './rate-limit.server';
import { getClient, saveClient } from './store.server';

// MCP clients reach XBase two ways: a CIMD URL as their client_id (preferred by the 2026-07-28
// spec), or Dynamic Client Registration (RFC 7591, deprecated but still what Cursor and MCP
// Inspector use). Every client is public: no secrets, PKCE instead.

const CIMD_CACHE_MS = 60 * 60 * 1000;
const MAX_REGISTRATION_BYTES = 64 * 1024;

/**
 * The client for a client_id, fetching its metadata document when the id is an https URL. Call it
 * only for the signed-in owner (see fetchClientMetadata).
 */
export async function findClient(clientId: string, now = new Date()): Promise<OAuthClient | null> {
  if (!clientId.startsWith('https://')) {
    const client = getClient(clientId);
    return client?.kind === 'dcr' ? client : null;
  }
  const url = cimdUrl(clientId);
  if (!url) return null;
  const cached = getClient(clientId);
  if (cached?.kind === 'cimd' && cached.fetchedAt) {
    if (now.getTime() - cached.fetchedAt.getTime() < CIMD_CACHE_MS) return cached;
  }
  const metadata = await fetchClientMetadata(url);
  if (!metadata) return null;
  return saveClient({ clientId, kind: 'cimd', ...metadata, fetchedAt: now, createdAt: now });
}

/** POST /oauth/register (RFC 7591). */
export async function handleRegister(request: Request, ip: string, now = new Date()) {
  if (overLimit(registerLimiter, ip, now.getTime())) {
    return oauthError(429, 'temporarily_unavailable', 'Too many registrations; try again later.', {
      'Retry-After': '3600',
    });
  }
  const text = await readCapped(request.body, MAX_REGISTRATION_BYTES);
  let body: unknown;
  try {
    body = text === null ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  const metadata = OAuthClientMetadataSchema.safeParse(body);
  if (!metadata.success) {
    return oauthError(400, 'invalid_client_metadata', 'Send the client metadata as JSON.');
  }
  // Keep the URIs the policy allows: Cursor registers a cursor:// URI next to a loopback one.
  const redirectUris = allowedRedirectUris(metadata.data.redirect_uris);
  if (redirectUris.length === 0) {
    return oauthError(
      400,
      'invalid_redirect_uri',
      'Register at least one https or loopback http redirect URI.',
    );
  }
  const client = saveClient({
    clientId: `dcr_${randomBytes(16).toString('base64url')}`,
    kind: 'dcr',
    clientName: cleanClientName(metadata.data.client_name) ?? 'MCP client',
    redirectUris,
    createdAt: now,
  });
  // The answer states what was registered, which may differ from the request: public client,
  // code flow with refresh tokens.
  return publicJson(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    201,
  );
}
