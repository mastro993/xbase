import { MAX_NICHE_KEYWORDS, type DiscoverySettings } from '@xbase/core/discovery';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';
import { KeywordEditor } from './KeywordEditor';

/** What the owner posts about: the first filter a batch runs, and what builds its searches. */
export function NichesCard({ settings }: { settings: DiscoverySettings['niches'] }) {
  const niches = useDiscoverySection('niches', settings);
  return (
    <DiscoveryCard
      title="Niches and keywords"
      description="The topics you post about. They match posts and build the searches a run makes."
      hint="Leave the list empty to consider every topic; the other sections still score what comes in."
      saving={niches.saving}
      saved={niches.saved}
      error={niches.error}
      onSubmit={() => void niches.save(niches.draft)}
      onReset={niches.restore}
    >
      <KeywordEditor
        kind="keyword"
        label="Topics"
        hint={`One keyword or phrase per line, or separated by commas, up to ${MAX_NICHE_KEYWORDS}.`}
        placeholder={'indie hacking\nbuild in public\nsmall apps'}
        value={niches.draft.keywords}
        max={MAX_NICHE_KEYWORDS}
        onChange={(keywords) => niches.edit({ keywords })}
      />
    </DiscoveryCard>
  );
}
