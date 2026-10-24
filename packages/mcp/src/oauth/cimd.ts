import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { OAuthClientInformationFullSchema } from '@modelcontextprotocol/core';
import { allowedRedirectUris, cleanClientName } from './client-metadata';
import { readCapped } from './http';

// Client ID Metadata Documents: an MCP client's client_id is an https URL serving its metadata
// (Claude, ChatGPT, VS Code). Fetching a URL from an authorization link lets whoever wrote the link
// aim this server's requests, so the fetch only runs for the signed-in owner and refuses anything
// that isn't a public internet address.

const FETCH_TIMEOUT_MS = 5000;
const MAX_DOCUMENT_BYTES = 64 * 1024;

function blockList(type: 'ipv4' | 'ipv6', subnets: [string, number][]) {
  const list = new BlockList();
  for (const [network, prefix] of subnets) list.addSubnet(network, prefix, type);
  return list;
}

// RFC 6890 special-purpose ranges: this host, private, CGNAT, loopback, link-local (cloud metadata
// at 169.254.169.254), protocol assignments, documentation, benchmarking, multicast and reserved.
const NON_PUBLIC_V4 = blockList('ipv4', [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
]);
// IPv6 is public only inside global unicast (2000::/3), which leaves out loopback, IPv4-mapped,
// NAT64, unique-local, link-local and multicast; minus the ranges inside it that tunnel to IPv4
// (Teredo, 6to4) or are reserved.
const GLOBAL_V6 = blockList('ipv6', [['2000::', 3]]);
const NON_PUBLIC_V6 = blockList('ipv6', [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
]);

/** True only for an address on the public internet. */
export function isPublicAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return !NON_PUBLIC_V4.check(address, 'ipv4');
    case 6:
      return GLOBAL_V6.check(address, 'ipv6') && !NON_PUBLIC_V6.check(address, 'ipv6');
    default:
      return false;
  }
}

/**
 * The client_id as a URL when it may be a metadata document: https, with a path, no fragment or
 * credentials, and already in canonical form, so the exact-match rule below is unambiguous.
 */
export function cimdUrl(clientId: string): URL | null {
  if (clientId.length > 2000 || !URL.canParse(clientId)) return null;
  const url = new URL(clientId);
  if (url.href !== clientId || url.protocol !== 'https:' || url.pathname === '/') return null;
  if (clientId.includes('#') || url.username || url.password) return null;
  return url;
}

async function resolvesToPublic(hostname: string): Promise<boolean> {
  const literal = hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(literal)) return isPublicAddress(literal);
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
  } catch {
    return false;
  }
}

/**
 * Fetches and checks a Client ID Metadata Document, or null when it can't be used. Call it only
 * after the owner's session is verified. Remaining risk: DNS could change between the check and
 * the fetch (rebinding); only the owner can trigger a fetch, so that is accepted.
 */
export async function fetchClientMetadata(
  url: URL,
): Promise<{ clientName: string; redirectUris: string[] } | null> {
  if (!(await resolvesToPublic(url.hostname))) return null;
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_DOCUMENT_BYTES) {
      await response.body?.cancel();
      return null;
    }
    const text = await readCapped(response.body, MAX_DOCUMENT_BYTES);
    if (!text) return null;
    const document = OAuthClientInformationFullSchema.safeParse(JSON.parse(text));
    // The document must name itself: anyone can host a copy of Claude's metadata elsewhere.
    if (!document.success || document.data.client_id !== url.href) return null;
    // Its declared auth method is ignored: ChatGPT declares private_key_jwt and still accepts
    // `none`, the only method this server offers.
    const redirectUris = allowedRedirectUris(document.data.redirect_uris);
    if (redirectUris.length === 0) return null;
    return { clientName: cleanClientName(document.data.client_name) ?? url.host, redirectUris };
  } catch {
    // Network errors, redirects, timeouts and malformed JSON all mean "no usable document".
    return null;
  }
}
