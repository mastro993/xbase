import { createServerFn } from '@tanstack/react-start';
import { AccountIdInput } from '@xbase/core/accounts';
import { validator } from '@xbase/core/validate';
import { getAccounts, removeAccount, switchAccount } from '@xbase/server/accounts';
import { requireSession } from '@/features/auth/session.server';

// The shell's and the settings page's entry points to @xbase/server/accounts. Adding an account is
// a sign-in with X: Settings links to /auth/x/start?intent=add.

export const getAccountsFn = createServerFn().handler(() => getAccounts(requireSession()));

export const switchAccountFn = createServerFn({ method: 'POST' })
  .validator(validator(AccountIdInput))
  .handler(({ data }) => switchAccount(requireSession(), data.id));

export const removeAccountFn = createServerFn({ method: 'POST' })
  .validator(validator(AccountIdInput))
  .handler(({ data }) => removeAccount(requireSession(), data.id));
