import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { getDiscoverySettingsFn } from '@/features/discover/settings/discovery.functions';
import { SourcesCard } from '@/features/discover/settings/SourcesCard';

const authed = getRouteApi('/_authed');

export const Route = createFileRoute('/_authed/settings/discovery/sources')({
  head: () => ({ meta: [{ title: 'Sources · Settings · XBase' }] }),
  loader: () => getDiscoverySettingsFn(),
  component: SourcesPage,
});

function SourcesPage() {
  const { sources } = Route.useLoaderData();
  const { current } = authed.useLoaderData();
  // Keyed by account: another account loads its own page count into a fresh form.
  return <SourcesCard key={current.id} settings={sources} />;
}
