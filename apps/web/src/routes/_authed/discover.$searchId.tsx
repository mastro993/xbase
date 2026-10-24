import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { SavedSearchNotFound } from '@/features/discover/SavedSearchNotFound';
import { SavedSearchView } from '@/features/discover/SavedSearchView';

const discover = getRouteApi('/_authed/discover');

// No loader of its own: the list's loader already has every search.
export const Route = createFileRoute('/_authed/discover/$searchId')({
  component: SavedSearchPage,
});

function SavedSearchPage() {
  const { searchId } = Route.useParams();
  const search = discover.useLoaderData().find((item) => item.id === searchId);
  if (!search) return <SavedSearchNotFound />;
  return <SavedSearchView key={search.id} search={search} />;
}
