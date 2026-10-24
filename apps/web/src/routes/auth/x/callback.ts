import { createFileRoute } from '@tanstack/react-router';
import { finishXSignIn } from '@/features/auth/x-oauth.server';

// Public (see guards.ts). X redirects here after the owner answers its consent screen.
export const Route = createFileRoute('/auth/x/callback')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(null, {
          status: 302,
          headers: {
            Location: await finishXSignIn(new URL(request.url)),
            'Cache-Control': 'no-store',
          },
        }),
    },
  },
});
