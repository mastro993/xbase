import { z } from 'zod';

// Shared by the settings page and the server: no server imports.

/** How an MCP client registered: Dynamic Client Registration, or a CIMD metadata URL as its id. */
export const OAUTH_CLIENT_KINDS = ['dcr', 'cimd'] as const;
export type OAuthClientKind = (typeof OAUTH_CLIENT_KINDS)[number];

/** An MCP client the owner approved and hasn't disconnected: one OAuth grant. */
export type ConnectedAppDto = {
  grantId: string;
  clientId: string;
  clientName: string;
  /** `cimd`: the name comes from a metadata document at `verifiedHost`. `dcr`: self-declared. */
  kind: OAuthClientKind;
  verifiedHost: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type McpSettingsDto = {
  /** The URL to paste into an MCP client. */
  mcpUrl: string;
  apps: ConnectedAppDto[];
};

export const RevokeConnectedAppInput = z.object({ grantId: z.string().min(1).max(100) });
