import { createFileRoute } from '@tanstack/react-router';
import { json } from '@xbase/server/http';
import { methodNotAllowed, withApiKey } from '@xbase/server/rest';

// Lets a client (the extension) check its key and that the URL is an XBase server.
// `version` is the REST API's version, the 1 in /api/v1.
export const Route = createFileRoute('/api/v1/me')({
  server: {
    handlers: {
      GET: ({ request }) => withApiKey(request, () => json({ app: 'xbase', version: 1 })),
      ANY: methodNotAllowed('GET'),
    },
  },
});
