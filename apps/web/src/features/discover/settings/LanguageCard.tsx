import {
  DISCOVERY_LANGUAGES,
  type DiscoveryLanguageCode,
  type DiscoverySettings,
} from '@xbase/core/discovery';
import { Select, SelectItem } from '@xbase/ui/components/base/select/select';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';

const LANGUAGES = Object.entries(DISCOVERY_LANGUAGES) as [DiscoveryLanguageCode, string][];

/** Which posts a run looks for, and which language the replies it drafts are written in. */
export function LanguageCard({ settings }: { settings: DiscoverySettings['language'] }) {
  const language = useDiscoverySection('language', settings);
  return (
    <DiscoveryCard
      title="Language"
      description="Which posts a run looks for, and which language it writes your replies in."
      hint="X’s search matches the posts: a reply is written in its own language."
      saving={language.saving}
      saved={language.saved}
      error={language.error}
      onSubmit={() => void language.save(language.draft)}
      onReset={language.restore}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          label="Posts to look for"
          selectedKey={language.draft.posts}
          onSelectionChange={(key) => {
            if (key) language.edit({ ...language.draft, posts: key as DiscoveryLanguageCode });
          }}
        >
          {LANGUAGES.map(([code, label]) => (
            <SelectItem key={code} id={code}>
              {label}
            </SelectItem>
          ))}
        </Select>
        <Select
          label="Replies to write"
          selectedKey={language.draft.replies}
          onSelectionChange={(key) => {
            if (key) language.edit({ ...language.draft, replies: key as DiscoveryLanguageCode });
          }}
        >
          {LANGUAGES.map(([code, label]) => (
            <SelectItem key={code} id={code}>
              {label}
            </SelectItem>
          ))}
        </Select>
      </div>
    </DiscoveryCard>
  );
}
