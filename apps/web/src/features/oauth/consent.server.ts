import type { OAuthClientKind } from '@/server/db/schema';
import type { ConsentSearch, ConsentView } from './consent.schema';
import { newSecret } from './crypto.server';
import { isLoopbackUri } from './redirect-uri';

// Validated authorization requests waiting for the owner's decision. In memory: one process, one
// owner, and a restart only means starting again from the app. Each is bound to the browser
// session that opened it and answered at most once, so the consent form can't be forged or
// replayed (with the Origin check in decideConsent).

export type AuthorizeRequest = {
  clientId: string;
  clientName: string;
  kind: OAuthClientKind;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
};

type Pending = { request: AuthorizeRequest; sessionId: string; expiresAt: number };

const TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 50;
const pending = new Map<string, Pending>();

/** Stores a validated request; the id goes into the consent page's URL and form. */
export function beginConsent(request: AuthorizeRequest, sessionId: string, now = Date.now()) {
  for (const [id, entry] of pending) if (entry.expiresAt <= now) pending.delete(id);
  // Only the owner creates these; the cap keeps a stuck tab reloading from growing the map.
  const oldest = pending.keys().next();
  if (pending.size >= MAX_PENDING && !oldest.done) pending.delete(oldest.value);
  // The prefix keeps the router's search parser from reading the id as a number.
  const id = newSecret('c_');
  pending.set(id, { request, sessionId, expiresAt: now + TTL_MS });
  return id;
}

/** A pending request, if it exists, hasn't expired and belongs to this session. */
function lookup(id: string, sessionId: string, now: number): AuthorizeRequest | null {
  const entry = pending.get(id);
  if (!entry || entry.expiresAt <= now || entry.sessionId !== sessionId) return null;
  return entry.request;
}

/** Answers a pending request: it is gone afterwards, whoever asked. */
export function takeConsent(id: string, sessionId: string, now = Date.now()) {
  const request = lookup(id, sessionId, now);
  pending.delete(id);
  return request;
}

/** What the consent page shows for its URL. */
export function consentView(
  { consent, error }: ConsentSearch,
  sessionId: string | null,
): ConsentView {
  if (error) return { kind: 'error', error };
  const request = consent && sessionId ? lookup(consent, sessionId, Date.now()) : null;
  if (!consent || !request) return { kind: 'error', error: 'expired' };
  const redirect = new URL(request.redirectUri);
  return {
    kind: 'consent',
    consentId: consent,
    clientName: request.clientName,
    verifiedHost: request.kind === 'cimd' ? new URL(request.clientId).host : null,
    redirectHost: redirect.host,
    redirectOrigin: redirect.origin,
    loopback: isLoopbackUri(request.redirectUri),
  };
}
