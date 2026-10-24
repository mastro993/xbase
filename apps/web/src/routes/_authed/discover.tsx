import { RiAddLine } from '@remixicon/react';
import { createFileRoute, Outlet, useMatch, useNavigate } from '@tanstack/react-router';
import { listSavedSearchesFn } from '@/features/discover/discover.functions';
import { SavedSearchDialog } from '@/features/discover/SavedSearchDialog';
import { SavedSearchList } from '@/features/discover/SavedSearchList';
import { SplitView } from '@/features/shell/SplitView';

// The workbench reads the selected search from this loader, so changes call router.invalidate()
// before they navigate to a new search, and after they leave a deleted one.
export const Route = createFileRoute('/_authed/discover')({
  head: () => ({ meta: [{ title: 'Discover · XBase' }] }),
  loader: () => listSavedSearchesFn(),
  component: DiscoverLayout,
});

function DiscoverLayout() {
  const searches = Route.useLoaderData();
  const navigate = useNavigate();
  const detail = !!useMatch({ from: '/_authed/discover/$searchId', shouldThrow: false });
  return (
    <SplitView
      title="Discover"
      action={
        <SavedSearchDialog
          size="small"
          leadingIcon={RiAddLine}
          onSaved={(search) =>
            navigate({ to: '/discover/$searchId', params: { searchId: search.id } })
          }
        >
          New search
        </SavedSearchDialog>
      }
      list={<SavedSearchList searches={searches} />}
      detail={detail}
      backTo="/discover"
    >
      <Outlet />
    </SplitView>
  );
}
