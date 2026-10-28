import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { getDiscoverySettingsFn } from '@/features/discover/settings/discovery.functions';
import { ExclusionsCard } from '@/features/discover/settings/ExclusionsCard';
import { LanguageCard } from '@/features/discover/settings/LanguageCard';
import { ThresholdsCard } from '@/features/discover/settings/ThresholdsCard';

const authed = getRouteApi('/_authed');

export const Route = createFileRoute('/_authed/settings/discovery/filters')({
  head: () => ({ meta: [{ title: 'Filters · Settings · XBase' }] }),
  loader: () => getDiscoverySettingsFn(),
  component: FiltersPage,
});

function FiltersPage() {
  const { thresholds, exclusions, language } = Route.useLoaderData();
  const { current } = authed.useLoaderData();
  // Keyed by account: another account loads its own rules into fresh forms.
  return (
    <>
      <ThresholdsCard key={`thresholds-${current.id}`} settings={thresholds} />
      <ExclusionsCard key={`exclusions-${current.id}`} settings={exclusions} />
      <LanguageCard key={`language-${current.id}`} settings={language} />
    </>
  );
}
