import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server';
import { resolveClientIp } from '@xbase/server/client-ip';
import { getEnv } from '@xbase/server/env';

// The rule for which address counts is resolveClientIp, in @xbase/server.

/** The current request's client, as a rate-limit key. Call it inside a request. */
export function clientIp(): string {
  const forwardedFor = getRequestHeader('x-forwarded-for');
  return resolveClientIp(getRequestIP(), forwardedFor, getEnv().TRUST_PROXY_HOPS);
}
