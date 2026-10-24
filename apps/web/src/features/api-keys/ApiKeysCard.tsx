import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { ApiKeyDto } from '@xbase/core/api-keys';
import { useRef, useState } from 'react';
import { LocalTime } from '@/features/posts/LocalTime';
import {
  ITEM_DETAILS,
  ITEM_LIST,
  ITEM_META,
  ITEM_NAME,
  ITEM_ROW,
} from '@/features/settings/item-list';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { SectionCard } from '@/features/shell/SectionCard';
import { revokeApiKeyFn } from './api-keys.functions';
import { NewApiKeyDialog } from './NewApiKeyDialog';

/** Keys for the REST API: a list with Revoke, and a dialog that creates one. */
export function ApiKeysCard({ keys }: { keys: ApiKeyDto[] }) {
  const router = useRouter();
  const revokeKey = useServerFn(revokeApiKeyFn);
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState('');

  const revoke = async (apiKey: ApiKeyDto) => {
    await revokeKey({ data: { id: apiKey.id } });
    await router.invalidate({ sync: true });
    setAnnouncement(`The key ${apiKey.name} was revoked.`);
    // The row and its Revoke button are gone: move focus to the card instead of the page.
    requestAnimationFrame(() => heading.current?.focus());
  };

  return (
    <SectionCard
      title="API keys"
      description="Let your scripts and other apps reach your drafts through the REST API. The browser extension will use it too."
      hint="XBase shows a key once, when you create it. Revoking one stops it at once."
      actions={<NewApiKeyDialog />}
      headingRef={heading}
    >
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {keys.length === 0 ? (
        <p className="text-body-regular text-text-secondary">No API keys yet.</p>
      ) : (
        <ul className={ITEM_LIST}>
          {keys.map((apiKey) => (
            <li key={apiKey.id} className={ITEM_ROW}>
              <div className={ITEM_DETAILS}>
                <p className={ITEM_NAME}>{apiKey.name}</p>
                <p className={ITEM_META}>
                  <span className="font-mono">{apiKey.prefix}…</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Created <LocalTime value={apiKey.createdAt} format="date" />
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {apiKey.lastUsedAt ? (
                      <>
                        Last used <LocalTime value={apiKey.lastUsedAt} format="date" />
                      </>
                    ) : (
                      'Never used'
                    )}
                  </span>
                </p>
              </div>
              <ConfirmButton
                size="small"
                title={`Revoke ${apiKey.name}?`}
                description="Anything using this key stops working at once. This can’t be undone."
                action="Revoke"
                errorTitle="Couldn’t revoke"
                onConfirm={() => revoke(apiKey)}
              >
                Revoke<span className="sr-only"> {apiKey.name}</span>
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
