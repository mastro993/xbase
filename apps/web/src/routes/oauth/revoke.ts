import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, preflight } from '@/features/oauth/http';
import { handleRevoke } from '@/features/oauth/revoke.server';

export const Route = createFileRoute('/oauth/revoke')({
  server: {
    handlers: {
      POST: ({ request }) => handleRevoke(request),
      OPTIONS: preflight,
      ANY: methodNotAllowed('POST, OPTIONS'),
    },
  },
});
