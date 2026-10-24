import { redirectAllowed } from './redirect-uri';

// What XBase keeps of the metadata a client declares about itself, through DCR or a CIMD document.
// The server may replace requested metadata (RFC 7591 §3.2.1), so it keeps only what it accepts.

const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME = 100;

/** The redirect URIs the policy allows, once each, at most 10; Cursor sends a `cursor://` too. */
export function allowedRedirectUris(uris: readonly string[]): string[] {
  return [...new Set(uris.filter(redirectAllowed))].slice(0, MAX_REDIRECT_URIS);
}

/** A self-declared name as one short line, or null when nothing is left. */
export function cleanClientName(name: string | undefined): string | null {
  const clean = name
    ?.replaceAll(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return clean ? clean.slice(0, MAX_CLIENT_NAME) : null;
}
