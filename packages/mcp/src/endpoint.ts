import {
  createMcpHandler,
  McpServer,
  type McpHttpHandler,
  OAuthError,
  OAuthErrorCode,
  originValidationResponse,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { oauthConfig } from './oauth/config';
import { verifyAccessToken } from './oauth/token';
import { registerTools } from './tools';

const INSTRUCTIONS =
  'XBase is a personal X (Twitter) workspace for one or more X accounts. Draft posts and threads, schedule them and read saved searches. Each post belongs to an account: lists cover every account unless `account` (an X username) narrows them, and create_draft needs `account` when several are linked. Times are ISO 8601 with a time zone. Nothing here publishes right away, and publishing to X isn’t connected yet.';

/** A fresh server per request: the handler is stateless. */
function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'xbase', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  registerTools(server);
  return server;
}

// Serves 2026-07-28 clients and, through its default stateless fallback, 2025-era ones.
let handler: McpHttpHandler | undefined;

/** /mcp: Origin check, then an OAuth access token for this resource, then the MCP SDK. */
export async function serveMcp(request: Request): Promise<Response> {
  const { issuer, resource, resourceMetadataUrl, scope } = oauthConfig();
  // MCP clients run on servers or in CLIs and send no Origin; a browser page on another site does.
  const forbidden = originValidationResponse(request, [new URL(issuer).hostname]);
  if (forbidden) return forbidden;
  const auth = await requireBearerAuth({
    verifier: {
      verifyAccessToken: async (token) => {
        const info = verifyAccessToken(token);
        if (!info) {
          throw new OAuthError(
            OAuthErrorCode.InvalidToken,
            'The access token is invalid or expired.',
          );
        }
        return info;
      },
    },
    requiredScopes: [scope],
    // A 401 points clients at the metadata, which starts sign-in (Claude needs the 401).
    resourceMetadataUrl,
    // Tokens issued for another resource are refused.
    expectedResource: new URL(resource),
  })(request);
  if (auth instanceof Response) return auth;
  handler ??= createMcpHandler(buildMcpServer);
  return handler.fetch(request, { authInfo: auth });
}
