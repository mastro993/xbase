import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { useRef, useState } from 'react';
import { revokeConnectedAppFn } from '@/features/mcp/mcp.functions';
import type { ConnectedAppDto } from '@/features/mcp/mcp.schema';
import { LocalTime } from '@/features/posts/LocalTime';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { ITEM_DETAILS, ITEM_LIST, ITEM_META, ITEM_NAME, ITEM_ROW } from './item-list';

/** The MCP clients the owner approved, each with Disconnect. */
export function ConnectedApps({ apps }: { apps: ConnectedAppDto[] }) {
  const router = useRouter();
  const revokeApp = useServerFn(revokeConnectedAppFn);
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState('');

  const revoke = async (app: ConnectedAppDto) => {
    await revokeApp({ data: { grantId: app.grantId } });
    await router.invalidate({ sync: true });
    setAnnouncement(`${app.clientName} was disconnected.`);
    // The row and its button are gone: keep focus in this list rather than on the page.
    requestAnimationFrame(() => heading.current?.focus());
  };

  return (
    <div className="flex flex-col gap-3">
      <h3
        ref={heading}
        tabIndex={-1}
        className="text-headline-medium text-text-primary outline-none"
      >
        Connected apps
      </h3>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {apps.length === 0 ? (
        <p className="text-body-regular text-text-secondary">
          No apps yet. Apps you approve show up here, and you can disconnect them at any time.
        </p>
      ) : (
        <ul className={ITEM_LIST}>
          {apps.map((app) => (
            <li key={app.grantId} className={ITEM_ROW}>
              <div className={ITEM_DETAILS}>
                <p className={ITEM_NAME}>{app.clientName}</p>
                <p className={ITEM_META}>
                  {/* The state is in the chip's words, not only its colour. */}
                  {app.verifiedHost ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Chip color="lime" variant="caption">
                        Verified
                      </Chip>
                      {app.verifiedHost}
                    </span>
                  ) : (
                    <Chip color="yellow" variant="caption">
                      Name not verified
                    </Chip>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>
                    Connected <LocalTime value={app.createdAt} format="date" />
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {app.lastUsedAt ? (
                      <>
                        Last used <LocalTime value={app.lastUsedAt} format="date" />
                      </>
                    ) : (
                      'Not used yet'
                    )}
                  </span>
                </p>
              </div>
              <ConfirmButton
                size="small"
                title={`Disconnect ${app.clientName}?`}
                description="Its access ends at once. To use it again, connect it again from the app and approve it."
                action="Disconnect"
                errorTitle="Couldn’t disconnect"
                onConfirm={() => revoke(app)}
              >
                Disconnect<span className="sr-only"> {app.clientName}</span>
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
