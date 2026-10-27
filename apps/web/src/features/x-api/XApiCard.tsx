import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  type SpendCapDto,
  type XApiSettings,
  type XApiUsageDto,
  formatUsdMicros,
} from '@xbase/core/x-api';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Input } from '@xbase/ui/components/base/input/input';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useState } from 'react';
import { LocalTime } from '@/features/posts/LocalTime';
import {
  ITEM_DETAILS,
  ITEM_LIST,
  ITEM_META,
  ITEM_NAME,
  ITEM_ROW,
} from '@/features/settings/item-list';
import { SavedStatus } from '@/features/shell/SavedStatus';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { saveXApiSettingsFn } from './x-api.functions';

// The owner's spend controls and the evidence behind them: what each X read cost, how much of
// X's rate-limit window is left, and where the caps stand. Every number comes from the one read
// layer; nothing here calls X. The workspace caps here are the hard limit every account shares;
// each account's own caps live with its discovery settings.

const capText = (value: number | null) => (value === null ? '' : String(value));

const parseCap = (text: string): number | null => {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed);
};

const isMoney = (value: number | null) => value === null || (Number.isFinite(value) && value >= 0);

const Spend = ({ label, micros, cap }: { label: string; micros: number; cap?: SpendCapDto }) => (
  <div className="flex flex-col gap-1 rounded-2xl bg-background-secondary-default p-4">
    <p className="text-body-2-regular text-text-secondary">{label}</p>
    <p className="text-title-3-semibold text-text-primary">{formatUsdMicros(micros)}</p>
    {cap !== undefined && cap.limitMicros !== null && (
      <p className="text-body-2-regular text-text-tertiary">
        of {formatUsdMicros(cap.limitMicros)}
      </p>
    )}
  </div>
);

/** A cap that stopped paid reads: which one, and when it resets. */
const CapReached = ({ name, cap }: { name: 'daily' | 'monthly'; cap: SpendCapDto }) =>
  cap.reached ? (
    <Callout tone="error" role="alert" title={`The ${name} spend cap is reached`}>
      Paid X reads for every account stop until <LocalTime value={cap.resetAt} format="dateTime" />,
      when the {name} cap of {cap.limitMicros === null ? '—' : formatUsdMicros(cap.limitMicros)}{' '}
      resets.
    </Callout>
  ) : null;

/** The workspace form: both hard caps and the cache window. */
function SettingsForm({ settings }: { settings: XApiSettings }) {
  const router = useRouter();
  const save = useServerFn(saveXApiSettingsFn);
  const formId = useId();
  const [daily, setDaily] = useState(capText(settings.budget.dailyCapUsd));
  const [monthly, setMonthly] = useState(capText(settings.budget.monthlyCapUsd));
  const [minutes, setMinutes] = useState(String(settings.cache.windowMinutes));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const dailyCap = parseCap(daily);
    const monthlyCap = parseCap(monthly);
    const windowMinutes = Number(minutes);
    if (!isMoney(dailyCap) || !isMoney(monthlyCap)) {
      setError('Enter a cap in dollars, or leave it blank for no cap.');
      return;
    }
    if (!Number.isInteger(windowMinutes) || windowMinutes < 0 || windowMinutes > 10_080) {
      setError('Cache for 0 to 10,080 minutes.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const stored: XApiSettings = await save({
        data: {
          budget: { dailyCapUsd: dailyCap, monthlyCapUsd: monthlyCap },
          cache: { windowMinutes },
        },
      });
      // Show what the server normalised.
      setDaily(capText(stored.budget.dailyCapUsd));
      setMonthly(capText(stored.budget.monthlyCapUsd));
      setMinutes(String(stored.cache.windowMinutes));
      setSaved(true);
      await router.invalidate({ sync: true });
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <Callout tone="error" role="alert" title="Not saved">
          {error}
        </Callout>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Daily spend cap (USD)"
          value={daily}
          inputMode="decimal"
          placeholder="No cap"
          hint="Paid reads stop once today’s spend across every account reaches this. Resets at midnight UTC."
          onChange={(value) => {
            setDaily(value);
            setSaved(false);
          }}
        />
        <Input
          label="Monthly spend cap (USD)"
          value={monthly}
          inputMode="decimal"
          placeholder="No cap"
          hint="The hard limit across every account. Resets on the first of the month, UTC."
          onChange={(value) => {
            setMonthly(value);
            setSaved(false);
          }}
        />
        <Input
          label="Cache window (minutes)"
          value={minutes}
          inputMode="numeric"
          hint="A post read this recently is served from the database, not paid for again. Zero turns the cache off."
          onChange={(value) => {
            setMinutes(value);
            setSaved(false);
          }}
        />
      </div>
      <p className="text-body-2-regular text-text-secondary">
        These are the hard caps for every account together. Each account can set lower caps of its
        own under Discovery settings.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SavedStatus saved={saved} />
        <Button
          type="submit"
          form={formId}
          leadingIcon={saving ? Spinner : undefined}
          aria-busy={saving || undefined}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

/** Spend, caps, rate-limit windows and the newest calls, plus the controls that set the limits. */
export function XApiCard({ usage }: { usage: XApiUsageDto }) {
  return (
    <SectionCard
      title="X API"
      description={`Every read of X goes through one layer that counts its estimated cost and caches posts. Search returns at most ${usage.resultsPerCall} posts per call.`}
      hint="Day, week and month are UTC, as X bills. A cached post costs nothing."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Spend label="Today" micros={usage.spend.todayMicros} cap={usage.caps.daily} />
        <Spend label="This week" micros={usage.spend.weekMicros} />
        <Spend label="This month" micros={usage.spend.monthMicros} cap={usage.caps.monthly} />
      </div>

      <CapReached name="daily" cap={usage.caps.daily} />
      <CapReached name="monthly" cap={usage.caps.monthly} />

      <SettingsForm settings={usage.settings} />

      <div className="flex flex-col gap-2">
        <h3 className="text-body-medium text-text-primary">Per account</h3>
        <ul className={ITEM_LIST}>
          {usage.accounts.map((account) => (
            <li key={account.id} className={ITEM_ROW}>
              <div className={ITEM_DETAILS}>
                <p className={ITEM_NAME}>@{account.username}</p>
                <p className={ITEM_META}>
                  <span>
                    {formatUsdMicros(account.spend.todayMicros)}
                    {account.caps.daily.limitMicros === null
                      ? ''
                      : ` of ${formatUsdMicros(account.caps.daily.limitMicros)}`}{' '}
                    today · {formatUsdMicros(account.spend.monthMicros)}
                    {account.caps.monthly.limitMicros === null
                      ? ''
                      : ` of ${formatUsdMicros(account.caps.monthly.limitMicros)}`}{' '}
                    this month
                  </span>
                </p>
                {account.caps.daily.reached && (
                  <p className={ITEM_META}>
                    <span>
                      Its daily cap is reached; resets{' '}
                      <LocalTime value={account.caps.daily.resetAt} format="dateTime" />
                    </span>
                  </p>
                )}
                {account.caps.monthly.reached && (
                  <p className={ITEM_META}>
                    <span>
                      Its monthly cap is reached; resets{' '}
                      <LocalTime value={account.caps.monthly.resetAt} format="dateTime" />
                    </span>
                  </p>
                )}
                {account.rateLimits.length === 0 ? (
                  <p className={ITEM_META}>No calls yet.</p>
                ) : (
                  account.rateLimits.map((limit) => (
                    <p key={limit.endpoint} className={ITEM_META}>
                      <span>{limit.endpoint}</span>
                      {limit.remaining !== null && limit.limit !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {limit.remaining} of {limit.limit} left
                          </span>
                        </>
                      )}
                      {limit.resetAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            resets <LocalTime value={limit.resetAt} format="time" />
                          </span>
                        </>
                      )}
                      {limit.dayRemaining !== null && limit.dayLimit !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {limit.dayRemaining} of {limit.dayLimit} left in 24h
                            {limit.dayResetAt && (
                              <>
                                , resets <LocalTime value={limit.dayResetAt} format="time" />
                              </>
                            )}
                          </span>
                        </>
                      )}
                    </p>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-body-medium text-text-primary">Recent calls</h3>
        {usage.calls.length === 0 ? (
          <p className="text-body-regular text-text-secondary">No calls yet.</p>
        ) : (
          <ul className={ITEM_LIST}>
            {usage.calls.map((call) => (
              <li key={call.id} className={ITEM_ROW}>
                <div className={ITEM_DETAILS}>
                  <p className={ITEM_NAME}>{call.endpoint}</p>
                  <p className={ITEM_META}>
                    <span>@{call.username}</span>
                    <span>{call.feature}</span>
                    <span>
                      {call.itemCount} {call.itemCount === 1 ? 'item' : 'items'}
                    </span>
                    <span>{formatUsdMicros(call.costMicros)}</span>
                    <LocalTime value={call.createdAt} format="stamp" />
                  </p>
                </div>
                {call.status !== 'ok' && (
                  <span className="text-body-2-regular text-text-error-primary">
                    {call.status === 'rate_limited' ? 'Rate limited' : 'Failed'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
