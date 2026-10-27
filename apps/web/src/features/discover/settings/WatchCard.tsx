import { type DiscoverySettings, MAX_WATCH_HANDLES } from '@xbase/core/discovery';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';
import { KeywordEditor } from './KeywordEditor';

/** Who to look at first, and who never to suggest. */
export function WatchCard({ settings }: { settings: DiscoverySettings['watch'] }) {
  const watch = useDiscoverySection('watch', settings);
  return (
    <DiscoveryCard
      title="Watch list"
      description="Accounts you check on every run, and accounts whose posts you never want to see."
      hint={`Up to ${MAX_WATCH_HANDLES} handles in each list, with or without the @.`}
      saving={watch.saving}
      saved={watch.saved}
      error={watch.error}
      onSubmit={() => void watch.save(watch.draft)}
      onReset={watch.restore}
    >
      <KeywordEditor
        kind="handle"
        label="Always check"
        hint="Their new posts arrive with a score boost, so they’re picked first."
        placeholder={'@mastro993\n@shl'}
        value={watch.draft.accounts}
        max={MAX_WATCH_HANDLES}
        onChange={(accounts) => watch.edit({ ...watch.draft, accounts })}
      />
      <KeywordEditor
        kind="handle"
        label="Never suggest"
        hint="Nothing from these accounts, however well they match."
        placeholder="@someone"
        value={watch.draft.blocked}
        max={MAX_WATCH_HANDLES}
        onChange={(blocked) => watch.edit({ ...watch.draft, blocked })}
      />
    </DiscoveryCard>
  );
}
