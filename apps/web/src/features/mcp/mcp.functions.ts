import { createServerFn } from '@tanstack/react-start';
import { oauthConfig } from '@/features/oauth/config.server';
import { validator } from '@/lib/validate';
import { listConnectedApps, revokeConnectedApp } from './connected-apps.server';
import { type McpSettingsDto, RevokeConnectedAppInput } from './mcp.schema';

// The settings page's entry points to the MCP connection.

export const getMcpSettingsFn = createServerFn().handler((): McpSettingsDto => ({
  mcpUrl: oauthConfig().resource,
  apps: listConnectedApps(),
}));

export const revokeConnectedAppFn = createServerFn({ method: 'POST' })
  .validator(validator(RevokeConnectedAppInput))
  .handler(({ data }) => revokeConnectedApp(data.grantId));
