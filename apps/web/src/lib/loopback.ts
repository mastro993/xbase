// Hosts that are this computer, as MCP clients and browsers treat them: an exact list, since
// Node-based clients don't resolve *.localhost and the rest of 127.0.0.0/8 is rarely used.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether a URL's `hostname` is this computer. IPv6 hostnames keep their brackets. */
export const isLoopbackHost = (hostname: string) => LOOPBACK_HOSTS.has(hostname);
