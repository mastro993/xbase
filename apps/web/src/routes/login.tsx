import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthCard } from '@xbase/ui/components/application/auth/auth-card';
import { SocialButton } from '@xbase/ui/components/base/social-button/social-button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { getAuthStateFn } from '@/features/auth/auth.functions';
import { LoginSearch, type SignInError, safeNext } from '@/features/auth/auth.schema';
import { AppMark } from '@/features/shell/AppMark';

export const Route = createFileRoute('/login')({
  validateSearch: LoginSearch,
  beforeLoad: async () => {
    if ((await getAuthStateFn()).authenticated) throw redirect({ to: '/' });
  },
  head: () => ({ meta: [{ title: 'Sign in · XBase' }] }),
  component: LoginPage,
});

const ERRORS: Record<SignInError, { title: string; description: string }> = {
  denied: {
    title: 'Sign-in cancelled',
    description: 'X didn’t give XBase access. Try again and choose Authorize app.',
  },
  not_linked: {
    title: 'This X account isn’t linked',
    description:
      'Another X account owns this XBase. Sign in with a linked account, then add this one in Settings.',
  },
  expired: {
    title: 'Sign-in expired',
    description: 'It took longer than 10 minutes, or started in another browser. Try again.',
  },
  failed: {
    title: 'X didn’t sign you in',
    description:
      'Check X_CLIENT_ID, X_CLIENT_SECRET and the callback URL of your X app, then try again.',
  },
};

function LoginPage() {
  const { next, error } = Route.useSearch();
  const message = error ? ERRORS[error] : undefined;
  const target = safeNext(next);
  const start =
    target === '/' ? '/auth/x/start' : `/auth/x/start?${new URLSearchParams({ next: target })}`;
  return (
    // min-h, not h: on a short or zoomed screen the page grows and scrolls instead of clipping.
    <main className="flex min-h-svh items-center justify-center p-6">
      {/* A plain link: the server route sends the browser on to X, with or without JavaScript. */}
      <AuthCard
        logo={<AppMark />}
        title="Sign in to XBase"
        description="Use your X account. The first one to sign in owns this XBase; add more in Settings."
      >
        {message && (
          <Callout tone="error" role="alert" title={message.title}>
            {message.description}
          </Callout>
        )}
        {/* Outlined: X's mark turns white in dark mode, where a black fill would vanish. */}
        <SocialButton brand="x" appearance="white" href={start} fullWidth />
      </AuthCard>
    </main>
  );
}
