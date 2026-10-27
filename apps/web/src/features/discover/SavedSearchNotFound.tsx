import { Search01Icon } from '@hugeicons/core-free-icons';
import { EmptyState } from '@/features/shell/EmptyState';
import { ButtonRouterLink } from '@/features/shell/router-links';

/** The Discover workbench for an unknown saved search. */
export function SavedSearchNotFound() {
  return (
    <div className="p-6">
      <EmptyState
        icon={Search01Icon}
        title="This saved search doesn’t exist"
        description="It may have been deleted."
        action={
          // Exact: Back points at the list this page sits under, which would otherwise mark it as
          // the current page.
          <ButtonRouterLink to="/discover" activeOptions={{ exact: true }} variant="secondary">
            Back to Discover
          </ButtonRouterLink>
        }
      />
    </div>
  );
}
