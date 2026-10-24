import { createHash, randomBytes } from 'node:crypto';
import { checkAuthorizeRequest, decideConsent } from '../authorize';
import { beginConsent } from '../consent';
import { saveClient } from '../store';
import { handleToken } from '../token';

// Test helpers for the OAuth flow. Test files mock @xbase/server/env with APP_URL = ISSUER:
// vi.mock('@xbase/server/env', () => ({ getEnv: () => ({ APP_URL: 'https://xbase.test' }) }));

export const ISSUER = 'https://xbase.test';
export const RESOURCE = `${ISSUER}/mcp`;
export const REDIRECT_URI = 'http://127.0.0.1:53682/callback';
export const SESSION = 'session-hash';

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function addDcrClient(redirectUris = ['http://127.0.0.1/callback'], clientName = 'Cursor') {
  return saveClient({
    clientId: `dcr_${randomBytes(8).toString('hex')}`,
    kind: 'dcr',
    clientName,
    redirectUris,
  });
}

export function authorizeQuery(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams({
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    state: 'state-123',
    resource: RESOURCE,
    ...params,
  });
}

export function consentPost(consentId: string, decision: string, origin: string | null = ISSUER) {
  return new Request(`${ISSUER}/oauth/authorize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(origin === null ? {} : { origin }),
    },
    body: new URLSearchParams({ consent_id: consentId, decision }),
  });
}

/** Runs authorize and consent like a browser would; returns the code from the redirect. */
export async function authorizationCode(clientId: string, now = new Date()) {
  const { verifier, challenge } = pkce();
  const gate = await checkAuthorizeRequest(
    authorizeQuery({ client_id: clientId, code_challenge: challenge }),
  );
  if (gate.kind !== 'ok') throw new Error(`authorize failed: ${JSON.stringify(gate)}`);
  const consentId = beginConsent(gate.request, SESSION, now.getTime());
  const response = await decideConsent(consentPost(consentId, 'approve'), SESSION, now);
  const code = new URL(response.headers.get('location') ?? '').searchParams.get('code');
  if (!code) throw new Error('no code');
  return { code, verifier, challenge };
}

export function tokenRequest(
  params: Record<string, string>,
  contentType = 'application/x-www-form-urlencoded',
) {
  return new Request(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: new URLSearchParams(params),
  });
}

export type TokenBody = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

/** A client connected through the whole flow, with its first token pair. */
export async function connectedClient(now = new Date()) {
  const client = addDcrClient();
  const { code, verifier } = await authorizationCode(client.clientId, now);
  const response = await handleToken(
    tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: client.clientId,
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
    }),
    'fixture',
    now,
  );
  const tokens = (await response.json()) as TokenBody;
  return { client, tokens };
}
