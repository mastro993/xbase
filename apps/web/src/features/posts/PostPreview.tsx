import { MAX_WEIGHTED_LENGTH, weightedLength } from '@xbase/core/posts/weighted-length';

/** A post or thread as it will read, one card per post. */
export function PostPreview({ parts }: { parts: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3" aria-label={parts.length > 1 ? 'Thread' : 'Post'}>
      {parts.map((text, index) => (
        <li
          // oxlint-disable-next-line react/no-array-index-key -- read-only, and the order is the identity
          key={index}
          className="flex flex-col gap-2 rounded-3xl border border-border-button-default bg-background-primary-default p-4"
        >
          <p className="text-headline-regular text-pretty break-words whitespace-pre-wrap text-text-primary">
            {text || <span className="text-text-tertiary">Empty post</span>}
          </p>
          <p className="text-caption-1-medium text-text-tertiary tabular-nums">
            {parts.length > 1 && `${index + 1}/${parts.length} · `}
            {weightedLength(text)}/{MAX_WEIGHTED_LENGTH} characters
          </p>
        </li>
      ))}
    </ol>
  );
}
