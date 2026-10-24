import { z } from 'zod';

// Shared by the consent page and the server: no server imports.

/** Why an authorization request stops on XBase's own page instead of going back to the app. */
export const AUTHORIZE_ERRORS = {
  invalid_request: 'The request has no client_id or redirect_uri, or repeats one.',
  unknown_client: 'XBase doesn’t know this app, or couldn’t read its metadata.',
  invalid_redirect_uri: 'The app asked to return to an address it didn’t register.',
  expired: 'This request expired or was already answered.',
} as const;
export type AuthorizeError = keyof typeof AUTHORIZE_ERRORS;
const AUTHORIZE_ERROR_CODES = Object.keys(AUTHORIZE_ERRORS) as [
  AuthorizeError,
  ...AuthorizeError[],
];

/** What the `mcp` scope allows, in the owner's words. */
export const SCOPE_DESCRIPTION = 'Read and write drafts, schedule posts, read saved searches';

/**
 * The consent page's URL carries only a pending request's id or an error code: the OAuth
 * parameters stay on the server, out of the router (which rewrites search strings) and history.
 */
export const ConsentSearch = z.object({
  consent: z.string().max(200).optional(),
  error: z.enum(AUTHORIZE_ERROR_CODES).optional().catch(undefined),
});
export type ConsentSearch = z.infer<typeof ConsentSearch>;

export type ConsentView =
  | {
      kind: 'consent';
      consentId: string;
      clientName: string;
      /** The host of a CIMD client's metadata URL; null for a self-registered (DCR) name. */
      verifiedHost: string | null;
      redirectHost: string;
      redirectOrigin: string;
      /** The redirect goes to an app on the owner's computer. */
      loopback: boolean;
    }
  | { kind: 'error'; error: AuthorizeError };
