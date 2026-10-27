import type { DiscoverySettings } from '@xbase/core/discovery';
import type { XApiAccountUsageDto } from '@xbase/core/x-api';
import { BudgetCard } from './BudgetCard';
import { ExclusionsCard } from './ExclusionsCard';
import { LanguageCard } from './LanguageCard';
import { NichesCard } from './NichesCard';
import { SourcesCard } from './SourcesCard';
import { ThresholdsCard } from './ThresholdsCard';
import { WatchCard } from './WatchCard';

/**
 * Every rule a discovery run follows, one card per section. Mount it with a key of the account's
 * id, so switching accounts loads that account's settings into fresh forms. `usage` is the same
 * account's X API spend, so the budget cap sits next to what it has used.
 */
export function DiscoverySettings({
  settings,
  usage,
}: {
  settings: DiscoverySettings;
  usage?: XApiAccountUsageDto;
}) {
  return (
    <>
      <NichesCard settings={settings.niches} />
      <WatchCard settings={settings.watch} />
      <ThresholdsCard settings={settings.thresholds} />
      <ExclusionsCard settings={settings.exclusions} />
      <LanguageCard settings={settings.language} />
      <SourcesCard settings={settings.sources} />
      <BudgetCard settings={settings.budget} usage={usage} />
    </>
  );
}
