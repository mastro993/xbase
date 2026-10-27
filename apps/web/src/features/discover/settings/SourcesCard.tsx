import { Clock01Icon } from '@hugeicons/core-free-icons';
import type { DiscoverySettings } from '@xbase/core/discovery';
import {
  estimateHomeTimelineCostMicros,
  estimateHomeTimelinePageMicros,
  formatUsdMicros,
} from '@xbase/core/x-api';
import { Input } from '@xbase/ui/components/base/input/input';
import { IconGlyph } from '@xbase/ui/utils/icon';
import { useState } from 'react';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';

/**
 * What a run reads, and how many paid pages of it. One page is 25 posts; the line under the box
 * shows the ceiling before the owner raises it, and a cache hit costs nothing.
 */
export function SourcesCard({ settings }: { settings: DiscoverySettings['sources'] }) {
  const sources = useDiscoverySection('sources', settings);
  const [pages, setPages] = useState(String(settings.homeTimelinePages));

  const pageCount = Number(pages);
  const wholePages = Number.isInteger(pageCount) && pageCount >= 1;
  const estimate = wholePages ? estimateHomeTimelineCostMicros(pageCount) : 0;

  const save = async () => {
    if (!wholePages) {
      sources.report('Pick a whole number of home timeline pages.');
      return;
    }
    const stored = await sources.save({ homeTimelinePages: pageCount });
    if (stored) setPages(String(stored.homeTimelinePages));
  };

  const reset = async () => {
    // Throws when it fails: ConfirmButton shows the error in the dialog.
    setPages(String((await sources.restore()).homeTimelinePages));
  };

  return (
    <DiscoveryCard
      title="Sources"
      description="Where a run looks for posts. The home timeline fetches one page by default, and every page is a paid read."
      hint="A change applies to the next run."
      saving={sources.saving}
      saved={sources.saved}
      error={sources.error}
      onSubmit={() => void save()}
      onReset={reset}
    >
      <Input
        label="Home timeline pages per run"
        value={pages}
        inputMode="numeric"
        hint="One page is up to 25 posts. Raise it only if a run needs more."
        validationBehavior="aria"
        onChange={(value) => {
          setPages(value.replace(/[^\d]/g, ''));
          sources.dirty();
        }}
      />
      <p className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
        <IconGlyph icon={Clock01Icon} aria-hidden className="size-4 shrink-0" />
        {wholePages
          ? `${pageCount} page${pageCount === 1 ? '' : 's'} per run costs up to ${formatUsdMicros(estimate)} (${pageCount} × ${formatUsdMicros(estimateHomeTimelinePageMicros())}); cache hits cost nothing.`
          : 'Pick a whole number of pages.'}
      </p>
    </DiscoveryCard>
  );
}
