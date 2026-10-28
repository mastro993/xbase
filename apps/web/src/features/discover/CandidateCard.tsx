import { ExternalLinkIcon } from '@hugeicons/core-free-icons';
import type { CandidateDto } from '@xbase/core/discover';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { ButtonLink } from '@xbase/ui/components/base/buttons/button';
import { LocalTime } from '@/features/posts/LocalTime';

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
 */
export function CandidateCard({ candidate }: { candidate: CandidateDto }) {
  const metrics = metricsLine(candidate.metrics);
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-2-regular text-text-secondary">{metrics || 'No engagement yet'}</p>
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
      </div>
    </article>
  );
}
