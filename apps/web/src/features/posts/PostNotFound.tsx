import { CalendarRemove01Icon, FileUnknownIcon } from '@hugeicons/core-free-icons';
import { EmptyState } from '@/features/shell/EmptyState';
import { ButtonRouterLink } from '@/features/shell/router-links';

// The Back links point at the list this page sits under, which would otherwise mark them as the
// current page: exact matching keeps that to the rail item.

/** The Drafts workbench for an unknown id. */
export function DraftNotFound() {
  return (
    <div className="p-6">
      <EmptyState
        icon={FileUnknownIcon}
        title="This draft doesn’t exist"
        description="It may have been deleted, here or through the API or MCP."
        action={
          <ButtonRouterLink to="/drafts" activeOptions={{ exact: true }} variant="secondary">
            Back to drafts
          </ButtonRouterLink>
        }
      />
    </div>
  );
}

/** The Queue workbench for a post that isn't queued: unscheduled (`draftId`), gone or published. */
export function NotQueued({ draftId }: { draftId?: string }) {
  return (
    <div className="p-6">
      <EmptyState
        icon={CalendarRemove01Icon}
        title="This post isn’t in the queue"
        description={
          draftId
            ? 'It was unscheduled and is a draft again.'
            : 'It may have been deleted, or already published.'
        }
        action={
          draftId ? (
            <ButtonRouterLink to="/drafts/$draftId" params={{ draftId }} variant="secondary">
              Open the draft
            </ButtonRouterLink>
          ) : (
            <ButtonRouterLink to="/queue" activeOptions={{ exact: true }} variant="secondary">
              Back to the queue
            </ButtonRouterLink>
          )
        }
      />
    </div>
  );
}
