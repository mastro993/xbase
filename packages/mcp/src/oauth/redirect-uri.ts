// Which redirect URIs a client may register and how a request's URI must match one (OAuth 2.1,
// RFC 8252, MCP authorization). A wrong match sends an authorization code to someone else.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// The scheme and loopback host of a URI as written, and its port, if any.
const LOOPBACK_PREFIX = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?=[/?]|$)/;

const parse = (uri: string) => (URL.canParse(uri) ? new URL(uri) : null);

/** An http URI on this computer, where a desktop or CLI app listens for the redirect. */
export function isLoopbackUri(uri: string): boolean {
  const url = parse(uri);
  return url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/** https anywhere, or http on a loopback host; never a fragment or credentials. */
export function redirectAllowed(uri: string): boolean {
  const url = parse(uri);
  if (!url || uri.includes('#') || url.username || url.password) return false;
  return url.protocol === 'https:' || isLoopbackUri(uri);
}

/**
 * Compares the strings exactly, without normalizing case, slashes or encoding. The one exception
 * (RFC 8252 §7.3): loopback URIs match on any port, since a native app listens on whichever port
 * is free. Claude Code needs that for `localhost` too, not only for IP literals.
 */
export function redirectMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  const withoutPort = (uri: string) => {
    const match = LOOPBACK_PREFIX.exec(uri);
    return match ? `http://${match[1]}${uri.slice(match[0].length)}` : null;
  };
  const a = withoutPort(registered);
  return a !== null && a === withoutPort(requested);
}
