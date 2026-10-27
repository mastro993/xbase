import type { DiscoverySettings } from '@xbase/core/discovery';
import { ExclusionsCard } from './ExclusionsCard';
import { LanguageCard } from './LanguageCard';
import { NichesCard } from './NichesCard';
import { ThresholdsCard } from './ThresholdsCard';
import { WatchCard } from './WatchCard';

/**
 * Every rule a discovery run follows, one card per section. Mount it with a key of the account's
 * id, so switching accounts loads that account's settings into fresh forms.
 */
export function DiscoverySettings({ settings }: { settings: DiscoverySettings }) {
  return (
    <>
      <NichesCard settings={settings.niches} />
      <WatchCard settings={settings.watch} />
      <ThresholdsCard settings={settings.thresholds} />
      <ExclusionsCard settings={settings.exclusions} />
      <LanguageCard settings={settings.language} />
    </>
  );
}
