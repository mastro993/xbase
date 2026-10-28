import { Add01Icon } from '@hugeicons/core-free-icons';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { AccountDto, AccountsDto } from '@xbase/core/accounts';
import type { SignInError } from '@xbase/core/auth';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { ButtonLink } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { useRef, useState } from 'react';
import {
  ITEM_DETAILS,
  ITEM_LIST,
  ITEM_META,
  ITEM_NAME,
  ITEM_ROW,
} from '@/features/settings/item-list';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { SectionCard } from '@/features/shell/SectionCard';
import { AccountAvatar, ADD_ACCOUNT_HREF } from './AccountMenu';
import { removeAccountFn } from './accounts.functions';

// Why adding an account came back to Settings without one. not_linked and not_owner only happen
// on /login.
const ADD_ERRORS: Record<Exclude<SignInError, 'not_linked' | 'not_owner'>, string> = {
  denied: 'X didn’t give XBase access. Try again and choose Authorize app.',
  expired: 'It took longer than 10 minutes. Try again.',
  failed: 'X didn’t answer as expected. Try again in a moment.',
};

/** The linked X accounts, with Add account and a Remove on each but the last. */
export function AccountsCard({ data, error }: { data: AccountsDto; error?: SignInError }) {
  const router = useRouter();
  const removeAccount = useServerFn(removeAccountFn);
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const { current, accounts } = data;
  const last = accounts.length === 1;

  const remove = async (account: AccountDto) => {
    await removeAccount({ data: { id: account.id } });
    await router.invalidate({ sync: true });
    setAnnouncement(`@${account.username} was removed.`);
    // The row and its button are gone: keep focus in this card rather than on the page.
    requestAnimationFrame(() => heading.current?.focus());
  };

  return (
    <SectionCard
      title="X accounts"
      headingRef={heading}
      description="Every linked account can sign in to this XBase. Drafts, the queue and the voice belong to the account you work as; switch it from the account menu."
      hint="X adds the account you’re signed in to on x.com. To add another, switch accounts on x.com first."
      actions={
        <ButtonLink href={ADD_ACCOUNT_HREF} variant="secondary" leadingIcon={Add01Icon}>
          Add account
        </ButtonLink>
      }
    >
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {error && error !== 'not_linked' && error !== 'not_owner' && (
        <Callout tone="error" role="alert" title="Account not added">
          {ADD_ERRORS[error]}
        </Callout>
      )}
      <ul className={ITEM_LIST}>
        {accounts.map((account) => (
          <li key={account.id} className={ITEM_ROW}>
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <AccountAvatar account={account} size="md" />
              <div className={ITEM_DETAILS}>
                <p className={ITEM_NAME}>{account.name}</p>
                <p className={ITEM_META}>
                  <span>@{account.username}</span>
                  {account.id === current.id && (
                    <Chip color="lime" variant="caption">
                      Working as
                    </Chip>
                  )}
                  {account.reconnectRequired && (
                    <Chip color="yellow" variant="caption">
                      Needs reconnecting
                    </Chip>
                  )}
                </p>
                {account.reconnectRequired && (
                  <p className={ITEM_META}>
                    <span>
                      X no longer accepts this account’s access, so XBase reads nothing with it.
                    </span>
                  </p>
                )}
              </div>
            </div>
            {account.reconnectRequired && (
              <ButtonLink href={ADD_ACCOUNT_HREF} size="small" variant="secondary">
                Sign in again<span className="sr-only"> as @{account.username}</span>
              </ButtonLink>
            )}
            {!last && (
              <ConfirmButton
                size="small"
                title={`Remove @${account.username}?`}
                description="Its drafts and scheduled posts are deleted, it can no longer sign in, and browsers signed in with it are signed out. Add it again at any time; the posts don’t come back."
                action="Remove"
                errorTitle="Couldn’t remove"
                onConfirm={() => remove(account)}
              >
                Remove<span className="sr-only"> @{account.username}</span>
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
