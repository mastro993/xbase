import {
  type DiscoverySettings,
  type ExclusionFilter,
  MAX_EXCLUSION_KEYWORDS,
} from '@xbase/core/discovery';
import { Switch } from '@xbase/ui/components/base/switch/switch';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';
import { KeywordEditor } from './KeywordEditor';

type Exclusions = DiscoverySettings['exclusions'];

const KEYWORD_FILTERS: { field: ExclusionFilter; label: string; hint: string; example: string }[] =
  [
    {
      field: 'bait',
      label: 'Engagement bait',
      hint: 'Posts that ask for a like, a repost or a tag instead of an answer.',
      example: 'like if\ncomment if',
    },
    {
      field: 'giveaways',
      label: 'Giveaways',
      hint: 'Contests where everyone replies and nobody reads.',
      example: 'giveaway\nenter to win',
    },
    {
      field: 'promos',
      label: 'Promotions',
      hint: 'Discount codes and sales pitches.',
      example: 'promo code\n% off',
    },
    {
      field: 'politics',
      label: 'Politics',
      hint: 'Elections and campaigns, whatever your niche.',
      example: 'election\nvote for',
    },
    {
      field: 'crypto',
      label: 'Crypto',
      hint: 'Coins, tokens and the launches around them.',
      example: 'airdrop\nmemecoin',
    },
  ];

const SHAPE_FILTERS: { field: 'imageOnly' | 'longThreads'; label: string; hint: string }[] = [
  {
    field: 'imageOnly',
    label: 'Image-only posts',
    hint: 'Nothing to reply to: the post is the picture.',
  },
  {
    field: 'longThreads',
    label: 'Long threads',
    hint: 'A reply lands under dozens of posts, where nobody reads it.',
  },
];

/** What a run keeps out of a batch: five keyword lists it can edit, and two shapes of post. */
export function ExclusionsCard({ settings }: { settings: Exclusions }) {
  const exclusions = useDiscoverySection('exclusions', settings);

  const setFilter = (field: ExclusionFilter, changes: Partial<Exclusions[ExclusionFilter]>) => {
    exclusions.edit({ ...exclusions.draft, [field]: { ...exclusions.draft[field], ...changes } });
  };

  const setShape = (field: 'imageOnly' | 'longThreads', enabled: boolean) => {
    exclusions.edit({ ...exclusions.draft, [field]: enabled });
  };

  return (
    <DiscoveryCard
      title="Exclusions"
      description="What a run leaves out, with the words it looks for. Each list is yours to edit."
      hint="Switch one off to let those posts through again, keywords and all."
      saving={exclusions.saving}
      saved={exclusions.saved}
      error={exclusions.error}
      onSubmit={() => void exclusions.save(exclusions.draft)}
      onReset={exclusions.restore}
    >
      {KEYWORD_FILTERS.map(({ field, label, hint, example }) => {
        const filter = exclusions.draft[field];
        return (
          <div key={field} className="flex flex-col gap-3">
            <Switch
              isSelected={filter.enabled}
              onChange={(enabled) => setFilter(field, { enabled })}
            >
              {label}
            </Switch>
            <p className="text-body-regular text-text-secondary">{hint}</p>
            {filter.enabled && (
              <KeywordEditor
                kind="keyword"
                label={`${label}: words to look for`}
                hint={`One keyword or phrase per line, up to ${MAX_EXCLUSION_KEYWORDS}.`}
                placeholder={example}
                value={filter.keywords}
                max={MAX_EXCLUSION_KEYWORDS}
                onChange={(keywords) => setFilter(field, { keywords })}
              />
            )}
          </div>
        );
      })}
      {SHAPE_FILTERS.map(({ field, label, hint }) => (
        <div key={field} className="flex flex-col gap-1">
          <Switch
            isSelected={exclusions.draft[field]}
            onChange={(enabled) => setShape(field, enabled)}
          >
            {label}
          </Switch>
          <p className="text-body-regular text-text-secondary">{hint}</p>
        </div>
      ))}
    </DiscoveryCard>
  );
}
