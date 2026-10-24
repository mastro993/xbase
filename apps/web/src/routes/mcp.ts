import { createFileRoute } from '@tanstack/react-router';
import { serveMcp } from '@/features/mcp/endpoint.server';

// Streamable HTTP. The SDK answers POST and refuses GET and DELETE (stateless server) with 405,
// after the Origin and token checks. No CORS: MCP clients call from servers and CLIs.
export const Route = createFileRoute('/mcp')({
  server: { handlers: { ANY: ({ request }) => serveMcp(request) } },
});
