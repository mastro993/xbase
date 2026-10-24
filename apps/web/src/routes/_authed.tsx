import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { getAccountsFn } from '@/features/accounts/accounts.functions';
import { getAuthStateFn } from '@/features/auth/auth.functions';
import { AppShell } from '@/features/shell/AppShell';

// Every signed-in page sits under this pathless layout. Document requests are already checked
// by pageGuard; this covers client-side navigation, which doesn't pass through it.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    if (!(await getAuthStateFn()).authenticated) {
      throw redirect({ to: '/login', search: { next: location.href } });
    }
  },
  // The linked accounts, for the shell's account menu; reloaded when the account changes.
  loader: () => getAccountsFn(),
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppShell accounts={Route.useLoaderData()}>
      <Outlet />
    </AppShell>
  );
}
