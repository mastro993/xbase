import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, preflight } from '@xbase/mcp/oauth/http';
import { handleToken } from '@xbase/mcp/oauth/token';
import { clientIp } from '@/server/client-ip.server';

export const Route = createFileRoute('/oauth/token')({
  server: {
    handlers: {
      POST: ({ request }) => handleToken(request, clientIp()),
      OPTIONS: preflight,
      ANY: methodNotAllowed('POST, OPTIONS'),
    },
  },
});
