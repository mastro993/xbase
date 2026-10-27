import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { listCandidatesFn } from '@/features/discover/discover.functions';
import { SavedSearchNotFound } from '@/features/discover/SavedSearchNotFound';
import { SavedSearchView } from '@/features/discover/SavedSearchView';

const discover = getRouteApi('/_authed/discover');
const authed = getRouteApi('/_authed');

// No search loader of its own: the list's loader already has every search. The candidates and
// the account's X access are what this page adds.
export const Route = createFileRoute('/_authed/discover/$searchId')({
  loader: ({ params }) => listCandidatesFn({ data: { id: params.searchId } }),
  component: SavedSearchPage,
});

function SavedSearchPage() {
  const { searchId } = Route.useParams();
  const candidates = Route.useLoaderData();
  const search = discover.useLoaderData().find((item) => item.id === searchId);
  const { current } = authed.useLoaderData();
  if (!search) return <SavedSearchNotFound />;
  return (
    <SavedSearchView
      key={search.id}
      search={search}
      candidates={candidates}
      canRead={!current.reconnectRequired}
    />
  );
}
