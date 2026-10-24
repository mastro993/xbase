import { isLoopbackHost } from '@/lib/loopback';

/**
 * Who can connect to the MCP server at this URL. `public`: an https address that isn't this
 * computer, so cloud clients like Claude can try it. `local`: only apps on the same machine.
 * `insecure`: plain http on another host, which MCP clients refuse. The same rule as the server's
 * boot warning (needsHttpsWarning).
 */
export function mcpReach(url: string): 'public' | 'local' | 'insecure' {
  const { protocol, hostname } = new URL(url);
  if (isLoopbackHost(hostname)) return 'local';
  return protocol === 'https:' ? 'public' : 'insecure';
}

/** What to paste in a terminal to add XBase to Claude Code. */
export const claudeCodeCommand = (mcpUrl: string) =>
  `claude mcp add --transport http xbase ${mcpUrl}`;
