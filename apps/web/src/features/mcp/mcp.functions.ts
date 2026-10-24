import { createServerFn } from '@tanstack/react-start';
import { type McpSettingsDto, RevokeConnectedAppInput } from '@xbase/core/mcp';
import { validator } from '@xbase/core/validate';
import { listConnectedApps, revokeConnectedApp } from '@xbase/mcp/connected-apps';
import { oauthConfig } from '@xbase/mcp/oauth/config';

// The settings page's entry points to the MCP connection.

export const getMcpSettingsFn = createServerFn().handler((): McpSettingsDto => ({
  mcpUrl: oauthConfig().resource,
  apps: listConnectedApps(),
}));

/** For the settings page to notice an app that connected while it was open. */
export const listConnectedAppsFn = createServerFn().handler(() => listConnectedApps());

export const revokeConnectedAppFn = createServerFn({ method: 'POST' })
  .validator(validator(RevokeConnectedAppInput))
  .handler(({ data }) => revokeConnectedApp(data.grantId));
