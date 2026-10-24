import {
  AUTHORIZE_ERRORS,
  type AuthorizeError,
  type ConsentView,
  SCOPE_DESCRIPTION,
} from '@xbase/core/consent';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import type { ReactNode } from 'react';
import { ButtonRouterLink } from '@/features/shell/router-links';

// The page an MCP client sends the owner to. Its main defence is what it shows: who is asking
// (verified host or a self-chosen name) and where the answer goes. It never approves by itself.

type PendingConsent = Extract<ConsentView, { kind: 'consent' }>;

/** A BoardUI card: the heading block, the body, then the actions in a footer band. */
function ConsentCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-xs">
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-title-2-medium break-words text-text-primary">{title}</h1>
          <div className="text-body-regular text-text-secondary">{subtitle}</div>
        </div>
        {children}
      </div>
      <div className="border-t border-separator-border bg-background-secondary-default px-6 py-3">
        {footer}
      </div>
    </section>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body-regular text-text-secondary">{term}</dt>
      <dd className="text-body-medium break-words text-text-primary">{children}</dd>
    </div>
  );
}

function ConsentForm({ view }: { view: PendingConsent }) {
  return (
    <ConsentCard
      title={`Allow ${view.clientName} to use XBase?`}
      subtitle={
        // The state is in the chip's words, not only its colour.
        view.verifiedHost ? (
          <span className="flex flex-wrap items-center gap-2">
            <Chip color="lime" variant="caption">
              Verified
            </Chip>
            {view.verifiedHost}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <Chip color="yellow" variant="caption">
              Name not verified
            </Chip>
            The app chose it itself.
          </span>
        )
      }
      footer={
        // A native POST: the server answers with a redirect to the app.
        <form method="post" action="/oauth/authorize" className="flex justify-end gap-2">
          <input type="hidden" name="consent_id" value={view.consentId} />
          <Button type="submit" variant="secondary" name="decision" value="deny">
            Deny
          </Button>
          <Button type="submit" name="decision" value="approve">
            Approve
          </Button>
        </form>
      }
    >
      <dl className="flex flex-col gap-3">
        <Detail term="Returns to">{view.redirectHost}</Detail>
        <Detail term="It will be able to">{SCOPE_DESCRIPTION}.</Detail>
      </dl>
      {view.loopback && (
        <Callout tone="warning" role="note" title="An app on this computer">
          Only continue if you started this from an app on this computer.
        </Callout>
      )}
      <p className="text-body-regular text-text-secondary">
        It can’t publish to X. You can disconnect it at any time in Settings.
      </p>
    </ConsentCard>
  );
}

function ErrorCard({ error }: { error: AuthorizeError }) {
  return (
    <ConsentCard
      title="This request can’t continue"
      subtitle={AUTHORIZE_ERRORS[error]}
      footer={
        <div className="flex justify-end">
          <ButtonRouterLink to="/" variant="secondary">
            Go to XBase
          </ButtonRouterLink>
        </div>
      }
    >
      <p className="text-body-regular text-text-secondary">
        Close this tab and connect again from your app.
      </p>
    </ConsentCard>
  );
}

/** /oauth/authorize: the owner approves or denies an MCP client. */
export function ConsentPage({ view }: { view: ConsentView }) {
  return (
    // min-h, not h: on a short or zoomed screen the page grows and scrolls instead of clipping.
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md">
        {view.kind === 'consent' ? <ConsentForm view={view} /> : <ErrorCard error={view.error} />}
      </div>
    </main>
  );
}
