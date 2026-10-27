import {
  Delete02Icon,
  ExternalLinkIcon,
  PencilEdit01Icon,
  SearchFocusIcon,
} from '@hugeicons/core-free-icons';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { SavedSearchDto } from '@xbase/core/discover';
import { ButtonLink } from '@xbase/ui/components/base/buttons/button';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { EmptyState } from '@/features/shell/EmptyState';
import { focusPageHeading } from '@/lib/focus';
import { deleteSavedSearchFn } from './discover.functions';
import { SavedSearchDialog } from './SavedSearchDialog';

/** X's own search, newest first: what the user can do until XBase runs searches itself. */
const xSearchUrl = (query: string) =>
  `https://x.com/search?${new URLSearchParams({ q: query, f: 'live' })}`;

/** The Discover workbench: one saved search, and where its results will appear. */
export function SavedSearchView({ search }: { search: SavedSearchDto }) {
  const router = useRouter();
  const navigate = useNavigate();
  const deleteSearch = useServerFn(deleteSavedSearchFn);

  // Leave first, so the workbench never renders a search that's gone.
  const destroy = async () => {
    await deleteSearch({ data: { id: search.id } });
    await navigate({ to: '/discover' });
    await router.invalidate();
    focusPageHeading();
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-title-3-semibold break-words text-text-primary">{search.name}</h2>
          <code className="rounded-xl bg-background-secondary-default px-3 py-2 font-mono text-body-2-regular break-all text-text-primary">
            {search.query}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmButton
            leadingIcon={Delete02Icon}
            title={`Delete “${search.name}”?`}
            description="The saved search is gone for good. This can’t be undone."
            action="Delete"
            errorTitle="Couldn’t delete"
            onConfirm={destroy}
          >
            Delete
          </ConfirmButton>
          <SavedSearchDialog search={search} variant="secondary" leadingIcon={PencilEdit01Icon}>
            Edit
          </SavedSearchDialog>
          <ButtonLink
            href={xSearchUrl(search.query)}
            target="_blank"
            rel="noreferrer"
            leadingIcon={ExternalLinkIcon}
          >
            Search on X<span className="sr-only"> (opens in a new tab)</span>
          </ButtonLink>
        </div>
      </header>
      <EmptyState
        icon={SearchFocusIcon}
        title="Results need the X API"
        description="Once XBase is connected to your X developer app, fresh posts matching this search show up here, ready to reply to. Replies open on x.com: the X API no longer lets apps reply to other people’s posts."
      />
    </div>
  );
}
