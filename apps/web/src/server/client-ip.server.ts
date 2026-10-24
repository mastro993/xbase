import { isIP, isIPv6 } from 'node:net';
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server';
import { getEnv } from './env.server';

// The client address that rate limits count against. Without a proxy it's the TCP peer, and
// X-Forwarded-For is ignored: any client can set it. Behind proxies, every request arrives from
// the last proxy, so TRUST_PROXY_HOPS says how many of them each add the address they saw to the
// end of X-Forwarded-For; the entry that many places from the right is the client. Entries left
// of it came from the client and are never read.

/** An IPv4-mapped IPv6 address is the IPv4 one; IPv6 counts per /64, which one host usually owns. */
export function rateLimitKey(ip: string): string {
  const address = ip.split('%')[0] ?? ip; // a link-local zone, e.g. fe80::1%eth0
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1]) return mapped[1];
  if (!isIPv6(address)) return address;
  const [head = '', tail] = address.split('::');
  const groups = (part: string | undefined) =>
    // A trailing dotted IPv4 fills the last two groups.
    part ? part.split(':').flatMap((group) => (group.includes('.') ? ['0', '0'] : [group])) : [];
  const left = groups(head);
  const right = groups(tail);
  const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  const prefix = [...left, ...zeros, ...right].slice(0, 4).map((group) => parseInt(group, 16));
  return `${prefix.map((group) => group.toString(16)).join(':')}::/64`;
}

/**
 * The client's address from the peer address and X-Forwarded-For, trusting `hops` proxies. Falls
 * back to the peer when the header has fewer entries or the entry isn't an IP address.
 */
export function resolveClientIp(
  peer: string | undefined,
  forwardedFor: string | undefined,
  hops: number,
): string {
  const entries = hops > 0 && forwardedFor ? forwardedFor.split(',').map((e) => e.trim()) : [];
  const forwarded = entries.length >= hops ? entries[entries.length - hops] : undefined;
  const ip = forwarded && isIP(forwarded) ? forwarded : peer;
  return ip ? rateLimitKey(ip) : 'unknown';
}

/** The current request's client, as a rate-limit key. Call it inside a request. */
export function clientIp(): string {
  const forwardedFor = getRequestHeader('x-forwarded-for');
  return resolveClientIp(getRequestIP(), forwardedFor, getEnv().TRUST_PROXY_HOPS);
}
