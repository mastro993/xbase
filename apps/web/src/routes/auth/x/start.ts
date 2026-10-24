import { createFileRoute } from '@tanstack/react-router';
import { startXSignIn } from '@/features/auth/x-oauth.server';

// Public (see guards.ts). /login's "Continue with X" and Settings' "Add account" link here:
// ?intent=add links another account, ?next= is where to land afterwards.
export const Route = createFileRoute('/auth/x/start')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const query = new URL(request.url).searchParams;
        const location = startXSignIn({
          intent: query.get('intent') === 'add' ? 'add' : 'sign_in',
          next: query.get('next'),
        });
        return new Response(null, {
          status: 302,
          headers: { Location: location, 'Cache-Control': 'no-store' },
        });
      },
    },
  },
});
