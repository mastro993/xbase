import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { SIGN_IN_ERRORS } from '@xbase/core/auth';
import { z } from 'zod';
import { AccountsCard } from '@/features/accounts/AccountsCard';

const authed = getRouteApi('/_authed');

// /settings is the accounts page: the X sign-in redirect comes back here with ?accountError=,
// so a separate index redirect would drop the reason the account wasn't added.
export const Route = createFileRoute('/_authed/settings/')({
  validateSearch: z.object({ accountError: z.enum(SIGN_IN_ERRORS).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: 'Accounts · Settings · XBase' }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const accounts = authed.useLoaderData();
  const { accountError } = Route.useSearch();
  return <AccountsCard data={accounts} error={accountError} />;
}
