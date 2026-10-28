import { createFileRoute } from '@tanstack/react-router';
import { getMcpSettingsFn } from '@/features/mcp/mcp.functions';
import { McpCard } from '@/features/settings/McpCard';

export const Route = createFileRoute('/_authed/settings/integrations/mcp')({
  head: () => ({ meta: [{ title: 'MCP · Settings · XBase' }] }),
  loader: () => getMcpSettingsFn(),
  component: McpPage,
});

function McpPage() {
  const settings = Route.useLoaderData();
  return <McpCard settings={settings} />;
}
