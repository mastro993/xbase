import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, preflight, publicJson } from '@/features/oauth/http';
import { authorizationServerMetadata } from '@/features/oauth/metadata.server';

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
