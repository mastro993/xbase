import { createFileRoute } from '@tanstack/react-router';
import { handleRegister } from '@xbase/mcp/oauth/clients';
import { methodNotAllowed, preflight } from '@xbase/mcp/oauth/http';
import { clientIp } from '@/server/client-ip.server';

export const Route = createFileRoute('/oauth/register')({
  server: {
    handlers: {
      POST: ({ request }) => handleRegister(request, clientIp()),
      OPTIONS: preflight,
      ANY: methodNotAllowed('POST, OPTIONS'),
    },
  },
});
