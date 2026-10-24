import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, preflight } from '@xbase/mcp/oauth/http';
import { handleRevoke } from '@xbase/mcp/oauth/revoke';

export const Route = createFileRoute('/oauth/revoke')({
  server: {
    handlers: {
      POST: ({ request }) => handleRevoke(request),
      OPTIONS: preflight,
      ANY: methodNotAllowed('POST, OPTIONS'),
    },
  },
});
