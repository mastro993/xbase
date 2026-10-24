import { createFileRoute, redirect } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { AuthCard } from '@xbase/ui/components/application/auth/auth-card';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { getAuthStateFn, loginFn } from '@/features/auth/auth.functions';
import { type LoginError, LoginSearch, safeNext } from '@/features/auth/auth.schema';
import { AppMark } from '@/features/shell/AppMark';

export const Route = createFileRoute('/login')({
  validateSearch: LoginSearch,
  beforeLoad: async () => {
    if ((await getAuthStateFn()).authenticated) throw redirect({ to: '/' });
  },
  head: () => ({ meta: [{ title: 'Sign in · XBase' }] }),
  component: LoginPage,
});

const ERRORS: Record<LoginError, { title: string; description: string }> = {
  invalid: {
    title: 'Wrong password',
    description: 'Check APP_PASSWORD in your server’s .env, then try again.',
  },
  rate_limited: {
    title: 'Too many attempts',
    description: 'Sign-in is paused for 15 minutes after 10 wrong passwords.',
  },
};

function LoginPage() {
  const { next, error } = Route.useSearch();
  const login = useServerFn(loginFn);
  const message = error ? ERRORS[error] : undefined;
  return (
    // min-h, not h: on a short or zoomed screen the page grows and scrolls instead of clipping.
    <main className="flex min-h-svh items-center justify-center p-6">
      {/* Without JavaScript the form posts natively and the server redirects. With it, the same
          FormData goes through useServerFn: a wrong password comes back as a client navigation to
          /login?error=…, and success reloads the document at `next` (see loginFn). */}
      <AuthCard
        logo={<AppMark />}
        title="Sign in to XBase"
        description="Use the password from your server’s .env."
        method="post"
        action={loginFn.url}
        onSubmit={(data) => login({ data })}
        isPasswordInvalid={error === 'invalid'}
      >
        <input type="hidden" name="next" value={safeNext(next)} />
        {message && (
          <Callout tone="error" role="alert" title={message.title}>
            {message.description}
          </Callout>
        )}
      </AuthCard>
    </main>
  );
}
