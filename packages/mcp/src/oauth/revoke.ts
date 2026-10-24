import { hashSecret } from './crypto';
import { emptyOk, oauthError, readOAuthForm, requestClientId } from './http';
import { findToken, revokeGrant } from './store';

/**
 * POST /oauth/revoke (RFC 7009). Either token revokes the whole grant, so the app is disconnected
 * as in Settings. The answer is 200 whether or not the token existed, so it reveals nothing.
 */
export async function handleRevoke(request: Request, now = new Date()): Promise<Response> {
  const form = await readOAuthForm(request, ['token', 'token_type_hint', 'client_id']);
  if (form instanceof Response) return form;
  const token = form.get('token');
  if (!token) return oauthError(400, 'invalid_request', 'token is required.');
  const row = findToken(hashSecret(token));
  const clientId = requestClientId(request, form);
  // A client that names itself may only revoke its own tokens.
  if (row && (!clientId || clientId === row.clientId)) revokeGrant(row.grantId, now);
  return emptyOk();
}
