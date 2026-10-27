import {
  DISCOVERY_THRESHOLDS,
  type DiscoverySettings,
  type DiscoveryThreshold,
} from '@xbase/core/discovery';
import { Input } from '@xbase/ui/components/base/input/input';
import { useState } from 'react';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';

/** The order the boxes appear in, and the line under each: its name comes from the core rules. */
const FIELDS: { field: DiscoveryThreshold; hint: string }[] = [
  { field: 'minAuthorFollowers', hint: 'Smaller accounts are skipped.' },
  { field: 'bestAgeHours', hint: 'Newer posts score best.' },
  { field: 'hardMaxAgeHours', hint: 'Never suggest an older post.' },
  { field: 'idealReplies', hint: 'Up to here, a post still looks quiet.' },
  { field: 'crowdedFrom', hint: 'From here on, the score drops.' },
  { field: 'hardReplyCap', hint: 'Never suggest a busier post.' },
  { field: 'authorCooldownDays', hint: 'How long an author waits after a pick.' },
  { field: 'maxPostsPerAuthor', hint: 'How many of one author’s posts a batch can hold.' },
  { field: 'maxPostsPerBatch', hint: 'How many picks a run aims for.' },
];

type ThresholdValues = DiscoverySettings['thresholds'];
/** The fields as typed: a cleared box has to read as empty, not as the number 0. */
type ThresholdText = Record<DiscoveryThreshold, string>;

const asText = (values: ThresholdValues): ThresholdText =>
  Object.fromEntries(FIELDS.map(({ field }) => [field, String(values[field])])) as ThresholdText;

/** The values the boxes hold, or null while one is empty: the server checks the rest. */
const asValues = (text: ThresholdText): ThresholdValues | null => {
  const values = FIELDS.map(({ field }) => [field, text[field]] as const);
  if (values.some(([, value]) => !/^\d+$/.test(value))) return null;
  return Object.fromEntries(
    values.map(([field, value]) => [field, Number(value)]),
  ) as ThresholdValues;
};

/**
 * What makes a post a good pick: how new, how quiet and how big its author. The server rejects
 * combinations that can't work (a hard cap below the ideal, a crowded penalty that never runs).
 */
export function ThresholdsCard({ settings }: { settings: DiscoverySettings['thresholds'] }) {
  const thresholds = useDiscoverySection('thresholds', settings);
  const [text, setText] = useState(() => asText(settings));

  const save = async () => {
    const values = asValues(text);
    if (!values) {
      thresholds.report('Fill in every threshold with a whole number.');
      return;
    }
    const stored = await thresholds.save(values);
    if (stored) setText(asText(stored));
  };

  const reset = async () => {
    // Throws when it fails: ConfirmButton shows the error in the dialog.
    setText(asText(await thresholds.restore()));
  };

  return (
    <DiscoveryCard
      title="Thresholds"
      description="What makes a post worth replying to: its author’s size, its age, and how busy it already is."
      hint="A change applies to the next run."
      saving={thresholds.saving}
      saved={thresholds.saved}
      error={thresholds.error}
      onSubmit={() => void save()}
      onReset={reset}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {FIELDS.map(({ field, hint }) => (
          <Input
            key={field}
            label={DISCOVERY_THRESHOLDS[field].label}
            hint={hint}
            value={text[field]}
            inputMode="numeric"
            maxLength={9}
            autoComplete="off"
            validationBehavior="aria"
            onChange={(value) => {
              setText({ ...text, [field]: value.replace(/[^\d]/g, '') });
              thresholds.dirty();
            }}
          />
        ))}
      </div>
    </DiscoveryCard>
  );
}
