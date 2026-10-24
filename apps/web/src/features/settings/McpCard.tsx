import type { McpSettingsDto } from '@xbase/core/mcp';
import { mcpReach } from '@xbase/core/mcp-url';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { SectionCard } from '@/features/shell/SectionCard';
import { ConnectedApps } from './ConnectedApps';
import { CopyField } from './CopyField';
import { McpConnectTabs } from './McpConnectTabs';

/** The MCP server's URL, how to connect clients, and the clients connected so far. */
export function McpCard({ settings }: { settings: McpSettingsDto }) {
  const reach = mcpReach(settings.mcpUrl);
  return (
    <SectionCard
      title="MCP"
      description="Let AI assistants such as Claude work with your drafts and queue."
      hint="Connected apps can read and write drafts, schedule posts and read saved searches. None can publish to X."
    >
      <CopyField label="Server URL" value={settings.mcpUrl} copyLabel="Copy server URL" />
      {reach === 'local' && (
        <Callout tone="info" role="note" title="Only apps on this computer can connect">
          Claude Code works with this address. Claude and other cloud clients need XBase at a public
          HTTPS address: set <code className="font-mono">APP_URL</code> to it.
        </Callout>
      )}
      {reach === 'insecure' && (
        <Callout tone="warning" role="note" title="MCP clients need HTTPS">
          Clients refuse a plain http address that isn’t on their own computer. Serve XBase over
          HTTPS and set <code className="font-mono">APP_URL</code> to that address.
        </Callout>
      )}
      <McpConnectTabs mcpUrl={settings.mcpUrl} />
      <ConnectedApps apps={settings.apps} />
    </SectionCard>
  );
}
