import { createFileRoute } from '@tanstack/react-router';
import { jsonError } from '@/server/http';

// Unknown API paths would otherwise fall through to the page renderer, which answers non-HTML
// requests with 406.
export const Route = createFileRoute('/api/$')({
  server: { handlers: { ANY: () => jsonError(404, 'not_found') } },
});
