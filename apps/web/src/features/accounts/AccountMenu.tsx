import { RiAddLine, RiCheckLine, RiExpandUpDownLine, RiLogoutBoxRLine } from '@remixicon/react';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Avatar } from '@xbase/ui/components/base/avatar/avatar';
import { ButtonLink } from '@xbase/ui/components/base/buttons/button';
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@xbase/ui/components/base/dropdown/dropdown';
import { MENU_ITEM, MENU_ITEM_INTERACTIVE } from '@xbase/ui/components/base/dropdown/menu-styles';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { cx } from '@xbase/ui/utils/cx';
import { useState } from 'react';
import { logoutFn } from '@/features/auth/auth.functions';
import { readableError } from '@/lib/readable-error';
import { switchAccountFn } from './accounts.functions';
import type { AccountDto, AccountsDto } from './accounts.schema';

/** Adding an account is signing in with it: X asks which account, then XBase switches to it. */
export const ADD_ACCOUNT_HREF = '/auth/x/start?intent=add';

/** The account's photo, or its initial while X has none. */
export function AccountAvatar({ account, size }: { account: AccountDto; size: 'xs' | 'md' }) {
  return (
    <Avatar
      size={size}
      src={account.avatarUrl ?? undefined}
      initials={account.username.slice(0, 1).toUpperCase()}
      alt=""
    />
  );
}

function AccountName({ account }: { account: AccountDto }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col text-start">
      <span className="truncate text-body-medium text-text-primary">{account.name}</span>
      <span className="truncate text-body-2-regular text-text-secondary">@{account.username}</span>
    </span>
  );
}

/**
 * The account this browser works as, at the foot of the sidebar: BoardUI's account menu, with
 * Add account and Sign out. Picking another account switches every page to it, so the app starts
 * over at home.
 */
export function AccountMenu({ data, collapsed }: { data: AccountsDto; collapsed: boolean }) {
  const router = useRouter();
  const switchAccount = useServerFn(switchAccountFn);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { current, accounts } = data;

  const choose = async (account: AccountDto) => {
    if (account.id === current.id) {
      setOpen(false);
      return;
    }
    setError(null);
    try {
      await switchAccount({ data: { id: account.id } });
      setOpen(false);
      await router.navigate({ to: '/' });
      await router.invalidate();
    } catch (cause) {
      setError(readableError(cause));
    }
  };

  return (
    <Dropdown
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DropdownTrigger
        aria-label={`Working as @${current.username}. Switch account`}
        className={cx(
          'flex items-center gap-2 rounded-2lg p-1 hover:bg-background-secondary-hover',
          collapsed ? 'w-9 justify-center rounded-full p-0.5' : 'w-full',
        )}
      >
        <AccountAvatar account={current} size="md" />
        {!collapsed && (
          <>
            <AccountName account={current} />
            <RiExpandUpDownLine
              className="size-4 shrink-0 text-foreground-icon-secondary"
              aria-hidden
            />
          </>
        )}
      </DropdownTrigger>
      <DropdownPopover aria-label="Accounts" placement={collapsed ? 'end bottom' : 'top start'}>
        {error && (
          <Callout tone="error" role="alert" title="Couldn’t switch">
            {error}
          </Callout>
        )}
        <DropdownGroup label="Work as">
          {accounts.map((account) => (
            <DropdownItem
              key={account.id}
              selected={account.id === current.id}
              onSelect={() => void choose(account)}
              className="px-2 py-1.5"
            >
              <AccountAvatar account={account} size="xs" />
              <AccountName account={account} />
              {account.id === current.id && (
                <RiCheckLine
                  className="size-4 shrink-0 text-foreground-icon-secondary"
                  aria-hidden
                />
              )}
            </DropdownItem>
          ))}
        </DropdownGroup>
        <ButtonLink
          href={ADD_ACCOUNT_HREF}
          variant="secondary"
          size="small"
          leadingIcon={RiAddLine}
          className="w-full"
        >
          Add account
        </ButtonLink>
        <DropdownDivider />
        {/* A native POST, with or without JavaScript: the server ends the session and redirects to
            /login. Leaving the page this way lets the browser ask first when a draft has unsaved
            changes; a client-side sign-out would end the session before the composer could ask. */}
        <form method="post" action={logoutFn.url}>
          <button type="submit" className={cx(MENU_ITEM, MENU_ITEM_INTERACTIVE)}>
            <RiLogoutBoxRLine
              className="size-5 shrink-0 text-foreground-icon-secondary"
              aria-hidden
            />
            <span className="text-body-medium">Sign out</span>
          </button>
        </form>
      </DropdownPopover>
    </Dropdown>
  );
}
