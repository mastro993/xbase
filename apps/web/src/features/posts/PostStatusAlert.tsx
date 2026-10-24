import { Callout } from '@xbase/ui/components/xbase/callout';
import { ButtonRouterLink } from '@/features/shell/router-links';
import { LocalTime } from './LocalTime';
import type { PostDto } from './posts.schema';

type PostStatusAlertProps = {
  post: PostDto;
  /** Link a scheduled post to its place in the Queue. */
  queueLink?: boolean;
};

/** Where a post stands, for any status but draft. Persistent, so it's a note, not an alert. */
export function PostStatusAlert({ post, queueLink = false }: PostStatusAlertProps) {
  switch (post.status) {
    case 'scheduled':
      return (
        <Callout
          tone="info"
          role="note"
          title={
            <>
              Scheduled for{' '}
              {post.publishAt ? <LocalTime value={post.publishAt} format="dateTime" /> : 'later'}
            </>
          }
          action={
            queueLink && (
              <ButtonRouterLink
                to="/queue/$postId"
                params={{ postId: post.id }}
                variant="secondary"
                size="small"
              >
                Open in Queue
              </ButtonRouterLink>
            )
          }
        >
          Publishing to X isn’t connected yet, so XBase won’t send it: it waits in the queue.
        </Callout>
      );
    case 'failed':
      return (
        <Callout tone="error" role="note" title="Couldn’t publish">
          {post.error ?? 'X didn’t accept the post.'} Reschedule it to try again, or unschedule it
          to keep it as a draft.
        </Callout>
      );
    case 'publishing':
      return (
        <Callout tone="info" role="note" title="Being published">
          XBase is sending it to X, so it can’t be changed.
        </Callout>
      );
    case 'published':
      return (
        <Callout tone="success" role="note" title="On X">
          {post.publishedAt && (
            <>
              Published <LocalTime value={post.publishedAt} format="dateTime" />.{' '}
            </>
          )}
          A published post can’t be changed.
        </Callout>
      );
    case 'draft':
      return null;
  }
}
