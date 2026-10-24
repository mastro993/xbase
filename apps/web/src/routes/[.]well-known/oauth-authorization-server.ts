import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, preflight, publicJson } from '@xbase/mcp/oauth/http';
import { authorizationServerMetadata } from '@xbase/mcp/oauth/metadata';

export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: {
    handlers: {
      GET: () =>
        publicJson(authorizationServerMetadata(), 200, { 'Cache-Control': 'public, max-age=3600' }),
      OPTIONS: preflight,
      ANY: methodNotAllowed('GET, OPTIONS'),
    },
  },
});
