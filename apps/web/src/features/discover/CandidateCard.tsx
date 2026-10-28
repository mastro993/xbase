import {
  CheckmarkCircle02Icon,
  ExternalLinkIcon,
  Forward01Icon,
  UserBlock01Icon,
} from '@hugeicons/core-free-icons';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { CandidateDto } from '@xbase/core/discover';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { Button, ButtonLink } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { useState } from 'react';
import { LocalTime } from '@/features/posts/LocalTime';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { readableError } from '@/lib/readable-error';
import {
  markCandidateRepliedFn,
  muteCandidateAuthorFn,
  skipCandidateFn,
} from './discover.functions';

/** A post's engagement, skipping the metrics X didn't return. */
function metricsLine(metrics: CandidateDto['metrics']): string {
  const parts = [
    metrics.replies === null ? null : `${metrics.replies.toLocaleString('en-US')} replies`,
    metrics.reposts === null ? null : `${metrics.reposts.toLocaleString('en-US')} reposts`,
    metrics.likes === null ? null : `${metrics.likes.toLocaleString('en-US')} likes`,
    metrics.quotes === null ? null : `${metrics.quotes.toLocaleString('en-US')} quotes`,
    metrics.views === null ? null : `${metrics.views.toLocaleString('en-US')} views`,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/**
 * One candidate as a run stored it: the full post, the post it quotes when it quotes one, and
 * enough engagement to see how quiet it is. The author's following flag is a priority hint, so a
 * followed author is marked rather than hidden.
 *
 * XBase can't reply for the owner, so "Mark replied" records a reply made on x.com and "Skip"
 * passes on the post: either takes it off the list for good. "Mute author" hides every post of
 * theirs until they leave the Never suggest list in Settings. The batch review (#20) will carry
 * the same actions. The card is gone once one succeeds, so `onHandled` says what happened and
 * takes the focus.
 */
export function CandidateCard({
  candidate,
  onHandled,
}: {
  candidate: CandidateDto;
  onHandled: (announcement: string) => void;
}) {
  const router = useRouter();
  const markReplied = useServerFn(markCandidateRepliedFn);
  const skip = useServerFn(skipCandidateFn);
  const mute = useServerFn(muteCandidateAuthorFn);
  const [busy, setBusy] = useState<'replied' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metrics = metricsLine(candidate.metrics);
  const handle = candidate.authorHandle;
  const whose = handle ? `@${handle}’s post` : 'the post';

  const decide = async (action: 'replied' | 'skip') => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const data = { id: candidate.id };
      await (action === 'replied' ? markReplied({ data }) : skip({ data }));
      // Sync, so the card is gone before the focus moves.
      await router.invalidate({ sync: true });
      onHandled(action === 'replied' ? `Marked ${whose} as replied.` : `Skipped ${whose}.`);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(null);
    }
  };

  // Throws on failure: ConfirmButton shows the error in its dialog.
  const muteAuthor = async () => {
    await mute({ data: { id: candidate.id } });
    await router.invalidate({ sync: true });
    onHandled(`Muted @${handle}: their posts are hidden.`);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-body-medium text-text-primary">
          {candidate.authorName ?? candidate.authorHandle ?? 'Unknown author'}
        </span>
        {candidate.authorHandle && (
          <span className="text-body-2-regular text-text-secondary">@{candidate.authorHandle}</span>
        )}
        <span className="text-body-2-regular text-text-tertiary">
          · <LocalTime value={candidate.postedAt} format="stamp" />
        </span>
        {candidate.authorFollowing === true && (
          <Chip variant="caption" color="gray">
            Following
          </Chip>
        )}
        {candidate.isQuote && (
          <Chip variant="caption" color="soft">
            Quote
          </Chip>
        )}
      </div>

      <p className="text-body-regular break-words whitespace-pre-wrap text-text-primary">
        {candidate.text}
      </p>

      {candidate.quoted && (
        <blockquote className="flex flex-col gap-1 rounded-xl border-s-2 border-border-button-default bg-background-secondary-default p-3">
          <span className="text-body-2-regular text-text-secondary">
            {candidate.quoted.authorHandle ? `@${candidate.quoted.authorHandle}` : 'Quoted post'}
          </span>
          <p className="text-body-2-regular break-words whitespace-pre-wrap text-text-primary">
            {candidate.quoted.text}
          </p>
        </blockquote>
      )}

      <p className="text-body-2-regular text-text-secondary">{metrics || 'No engagement yet'}</p>

      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={candidate.url}
          target="_blank"
          rel="noreferrer"
          size="small"
          variant="secondary"
          leadingIcon={ExternalLinkIcon}
        >
          Open on X<span className="sr-only"> (opens in a new tab)</span>
        </ButtonLink>
        <Button
          size="small"
          variant="secondary"
          leadingIcon={busy === 'replied' ? Spinner : CheckmarkCircle02Icon}
          aria-busy={busy === 'replied' || undefined}
          onClick={() => void decide('replied')}
        >
          Mark replied{handle && <span className="sr-only"> to @{handle}</span>}
        </Button>
        <Button
          size="small"
          variant="secondary"
          leadingIcon={busy === 'skip' ? Spinner : Forward01Icon}
          aria-busy={busy === 'skip' || undefined}
          onClick={() => void decide('skip')}
        >
          Skip<span className="sr-only"> {whose}</span>
        </Button>
        {handle && (
          <ConfirmButton
            size="small"
            variant="secondary"
            leadingIcon={UserBlock01Icon}
            disabled={busy !== null}
            title={`Mute @${handle}?`}
            description="Discover won’t suggest their posts again. You can take them off the Never suggest list in Settings → Discovery → Topics."
            action="Mute"
            errorTitle="Couldn’t mute"
            onConfirm={muteAuthor}
          >
            Mute author<span className="sr-only"> @{handle}</span>
          </ConfirmButton>
        )}
      </div>

      {error && (
        <Callout tone="error" role="alert" title="Couldn’t update the candidate">
          {error}
        </Callout>
      )}
    </article>
  );
}
