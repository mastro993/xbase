import { createServerFn } from '@tanstack/react-start';
import { requireSession } from '@/features/auth/session.server';
import { validator } from '@/lib/validate';
import { AccountIdInput } from './accounts.schema';
import { getAccounts, removeAccount, switchAccount } from './accounts.server';

// The shell's and the settings page's entry points to accounts.server.ts. Adding an account is a
// sign-in with X: Settings links to /auth/x/start?intent=add.

export const getAccountsFn = createServerFn().handler(() => getAccounts(requireSession()));

export const switchAccountFn = createServerFn({ method: 'POST' })
  .validator(validator(AccountIdInput))
  .handler(({ data }) => switchAccount(requireSession(), data.id));

export const removeAccountFn = createServerFn({ method: 'POST' })
  .validator(validator(AccountIdInput))
  .handler(({ data }) => removeAccount(requireSession(), data.id));
