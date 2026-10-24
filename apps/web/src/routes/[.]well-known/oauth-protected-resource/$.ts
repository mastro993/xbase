import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, oauthError, preflight, publicJson } from '@xbase/mcp/oauth/http';
import { protectedResourceMetadata } from '@xbase/mcp/oauth/metadata';

// One document at both RFC 9728 locations: the path-aware one for /mcp, which the 401 from /mcp
// points at, and the root one, which the MCP spec allows as a fallback.
const PATHS = new Set([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/',
  '/.well-known/oauth-protected-resource/mcp',
]);

export const Route = createFileRoute('/.well-known/oauth-protected-resource/$')({
  server: {
    handlers: {
      GET: ({ pathname }) =>
        PATHS.has(pathname)
          ? publicJson(protectedResourceMetadata(), 200, {
              'Cache-Control': 'public, max-age=3600',
            })
          : oauthError(404, 'not_found'),
      OPTIONS: preflight,
      ANY: methodNotAllowed('GET, OPTIONS'),
    },
  },
});
