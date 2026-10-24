import { createFileRoute } from '@tanstack/react-router';
import { oauthError } from '@xbase/mcp/oauth/http';

// Clients probe other discovery paths (openid-configuration, path-aware variants): a JSON 404 lets
// them move on. Without it they get the HTML page renderer, or a 406.
export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { ANY: () => oauthError(404, 'not_found') } },
});
