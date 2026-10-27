import type { DiscoverySettings } from '@xbase/core/discovery';
import { type XApiAccountUsageDto, formatUsdMicros } from '@xbase/core/x-api';
import { Input } from '@xbase/ui/components/base/input/input';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { useState } from 'react';
import { LocalTime } from '@/features/posts/LocalTime';
import { DiscoveryCard, useDiscoverySection } from './DiscoveryCard';

const capText = (value: number | null) => (value === null ? '' : String(value));

const parseCap = (text: string): number | null => {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed);
};

const isMoney = (value: number | null) => value === null || (Number.isFinite(value) && value >= 0);

/**
 * This account's own daily and monthly caps, inside the workspace's hard limit, with what it has
 * spent against them. Both are in dollars; a blank box is no cap.
 */
export function BudgetCard({
  settings,
  usage,
}: {
  settings: DiscoverySettings['budget'];
  /** The account's spend and caps, as the X API layer counts them; null before any read. */
  usage?: XApiAccountUsageDto;
}) {
  const budget = useDiscoverySection('budget', settings);
  const [daily, setDaily] = useState(capText(settings.dailyCapUsd));
  const [monthly, setMonthly] = useState(capText(settings.monthlyCapUsd));

  const save = async () => {
    const dailyCapUsd = parseCap(daily);
    const monthlyCapUsd = parseCap(monthly);
    if (!isMoney(dailyCapUsd) || !isMoney(monthlyCapUsd)) {
      budget.report('Enter a cap in dollars, or leave it blank for no cap.');
      return;
    }
    const stored = await budget.save({ dailyCapUsd, monthlyCapUsd });
    if (stored) {
      setDaily(capText(stored.dailyCapUsd));
      setMonthly(capText(stored.monthlyCapUsd));
    }
  };

  const reset = async () => {
    // Throws when it fails: ConfirmButton shows the error in the dialog.
    const stored = await budget.restore();
    setDaily(capText(stored.dailyCapUsd));
    setMonthly(capText(stored.monthlyCapUsd));
  };

  return (
    <DiscoveryCard
      title="Budget"
      description="How much this account may spend on X reads. The caps in Settings → X API are the hard limit over every account together."
      hint="Paid reads stop at a cap until it resets: at midnight UTC for the day, on the first of the month for the month."
      saving={budget.saving}
      saved={budget.saved}
      error={budget.error}
      onSubmit={() => void save()}
      onReset={reset}
    >
      {usage?.caps.daily.reached && (
        <Callout tone="error" role="alert" title="The daily cap for this account is reached">
          Paid reads for @{usage.username} stop until{' '}
          <LocalTime value={usage.caps.daily.resetAt} format="dateTime" />, when the daily cap of{' '}
          {usage.caps.daily.limitMicros === null
            ? '—'
            : formatUsdMicros(usage.caps.daily.limitMicros)}{' '}
          resets.
        </Callout>
      )}
      {usage?.caps.monthly.reached && (
        <Callout tone="error" role="alert" title="The monthly cap for this account is reached">
          Paid reads for @{usage.username} stop until{' '}
          <LocalTime value={usage.caps.monthly.resetAt} format="dateTime" />, when the monthly cap
          of{' '}
          {usage.caps.monthly.limitMicros === null
            ? '—'
            : formatUsdMicros(usage.caps.monthly.limitMicros)}{' '}
          resets.
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input
          label="Daily spend cap (USD)"
          value={daily}
          inputMode="decimal"
          placeholder="No cap"
          hint="Paid reads for this account stop once today’s spend reaches this."
          validationBehavior="aria"
          onChange={(value) => {
            setDaily(value);
            budget.dirty();
          }}
        />
        <Input
          label="Monthly spend cap (USD)"
          value={monthly}
          inputMode="decimal"
          placeholder="No cap"
          hint="Paid reads for this account stop once this month’s spend reaches this."
          validationBehavior="aria"
          onChange={(value) => {
            setMonthly(value);
            budget.dirty();
          }}
        />
      </div>
      {usage && (
        <p className="text-body-2-regular text-text-secondary">
          @{usage.username} spent {formatUsdMicros(usage.spend.todayMicros)} today and{' '}
          {formatUsdMicros(usage.spend.monthMicros)} this month.
        </p>
      )}
    </DiscoveryCard>
  );
}
