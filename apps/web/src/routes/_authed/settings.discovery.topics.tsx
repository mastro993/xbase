import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { getDiscoverySettingsFn } from '@/features/discover/settings/discovery.functions';
import { NichesCard } from '@/features/discover/settings/NichesCard';
import { WatchCard } from '@/features/discover/settings/WatchCard';

const authed = getRouteApi('/_authed');

export const Route = createFileRoute('/_authed/settings/discovery/topics')({
  head: () => ({ meta: [{ title: 'Topics · Settings · XBase' }] }),
  loader: () => getDiscoverySettingsFn(),
  component: TopicsPage,
});

function TopicsPage() {
  const { niches, watch } = Route.useLoaderData();
  const { current } = authed.useLoaderData();
  // Keyed by account: switching accounts loads another account's lists into fresh forms.
  return (
    <>
      <NichesCard key={`niches-${current.id}`} settings={niches} />
      <WatchCard key={`watch-${current.id}`} settings={watch} />
    </>
  );
}
