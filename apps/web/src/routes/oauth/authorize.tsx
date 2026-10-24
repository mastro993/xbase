import { createFileRoute } from '@tanstack/react-router';
import { ConsentSearch } from '@xbase/core/consent';
import { decideConsent, startAuthorization } from '@xbase/mcp/oauth/authorize';
import { readSession } from '@/features/auth/session.server';
import { ConsentPage } from '@/features/oauth/ConsentPage';
import { getConsentFn } from '@/features/oauth/oauth.functions';

// The OAuth authorization endpoint, outside the app shell. pageGuard requires a session, so a
// signed-out owner signs in first and comes back. GET validates the request, parks it as a pending
// consent and moves to ?consent=<id>, which renders the page; POST is the owner's answer.
export const Route = createFileRoute('/oauth/authorize')({
  validateSearch: ConsentSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getConsentFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Allow access · XBase' }] }),
  headers: ({ loaderData }) => ({
    'Cache-Control': 'no-store',
    // No framing (clickjacking). The form may post here, and its redirect may go to the app.
    'Content-Security-Policy': `frame-ancestors 'none'; form-action 'self'${
      loaderData?.kind === 'consent' ? ` ${loaderData.redirectOrigin}` : ''
    }`,
    // Not no-referrer: with it, browsers send `Origin: null` on the form's POST, which then fails
    // the Origin check. same-origin sends no referrer to other sites either.
    'Referrer-Policy': 'same-origin',
  }),
  server: {
    handlers: {
      GET: async ({ request, next }) =>
        (await startAuthorization(request, readSession()?.id ?? null)) ?? next(),
      POST: ({ request }) => decideConsent(request, readSession()?.id ?? null),
    },
  },
  component: AuthorizePage,
});

function AuthorizePage() {
  return <ConsentPage view={Route.useLoaderData()} />;
}
