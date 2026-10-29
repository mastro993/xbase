// Bring Array#toSorted along: the app's lib setting stops at ES2022.
/// <reference lib="es2023.array" />
import { PlayIcon } from '@hugeicons/core-free-icons';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { EXCLUSION_REASON_LABELS, type ExclusionReason } from '@xbase/core/discovery-filters';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { useState } from 'react';
import { readableError } from '@/lib/readable-error';
import { runDiscoveryFn } from './discover.functions';

type Run = Awaited<ReturnType<typeof runDiscoveryFn>>;

/** What the filters kept out, biggest reason first: "3 left out by your filters: bait 2, crypto 1." */
function excludedLine(excluded: Run['excluded']): string {
  if (excluded.length === 0) return '';
  const counts = new Map<ExclusionReason, number>();
  for (const { reason } of excluded) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const reasons = [...counts]
    .toSorted(([, a], [, b]) => b - a)
    .map(([reason, count]) => `${EXCLUSION_REASON_LABELS[reason]} ${count}`)
    .join(', ');
  return ` ${excluded.length} left out by your filters: ${reasons}.`;
}

/** What the run read, in a sentence or two: the counts the page then shows per search. */
function summaryOf({ home, searches, excluded }: Run): string {
  const found = home + searches.reduce((total, search) => total + search.candidates, 0);
  const sources = searches.length === 1 ? '1 search' : `${searches.length} searches`;
  return `${found} candidate${found === 1 ? '' : 's'} from your home timeline and ${sources}.${excludedLine(excluded)}`;
}

/**
 * The manual run: one home timeline page plus every enabled saved search, through the account's
 * own token. A partial run (a cap, a 429, an account to reconnect) still stores what it read, so
 * the page gets both the summary and the reason it stopped.
 */
export function RunDiscoveryButton() {
  const router = useRouter();
  const run = useServerFn(runDiscoveryFn);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [stop, setStop] = useState<{ message: string; kept: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (running) return;
    setRunning(true);
    setSummary(null);
    setStop(null);
    setError(null);
    try {
      const result = await run();
      await router.invalidate();
      if (result.stop) setStop({ message: result.stop.message, kept: summaryOf(result) });
      else setSummary(summaryOf(result));
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          variant="secondary"
          leadingIcon={running ? Spinner : PlayIcon}
          aria-busy={running || undefined}
          onClick={() => void start()}
        >
          {running ? 'Reading X…' : 'Run discovery'}
        </Button>
      </div>
      {summary && (
        <Callout tone="success" role="status">
          {summary}
        </Callout>
      )}
      {stop && (
        <Callout tone="warning" role="status" title="Part of the run didn’t finish">
          {stop.message} {stop.kept}
        </Callout>
      )}
      {error && (
        <Callout tone="error" role="alert" title="Couldn’t run discovery">
          {error}
        </Callout>
      )}
    </div>
  );
}
