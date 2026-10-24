/**
 * The RFC 8707 resource a client asked for, as the canonical MCP URL, or null when it names
 * anything else. Lenient where real clients differ: no resource at all (Codex CLI), the bare
 * origin (ChatGPT), a trailing slash or an uppercase host all mean the MCP endpoint.
 */
export function matchResource(
  values: readonly string[],
  { issuer, resource }: { issuer: string; resource: string },
): string | null {
  for (const value of values) {
    if (!URL.canParse(value)) return null;
    const url = new URL(value);
    if (url.search || value.includes('#') || url.username || url.password) return null;
    // origin lowercases the scheme and host and drops a default port.
    const normalized = `${url.origin}${url.pathname}`.replace(/\/$/, '');
    if (normalized !== resource && normalized !== issuer) return null;
  }
  return resource;
}
