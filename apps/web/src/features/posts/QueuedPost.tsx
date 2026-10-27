import { PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { PostDto } from '@xbase/core/posts/schema';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { useState } from 'react';
import { ButtonRouterLink } from '@/features/shell/router-links';
import { focusPageHeading } from '@/lib/focus';
import { readableError } from '@/lib/readable-error';
import { LocalTime } from './LocalTime';
import { PostPreview } from './PostPreview';
import { schedulePostFn, unschedulePostFn } from './posts.functions';
import { PostStatusAlert } from './PostStatusAlert';
import { ScheduleDialog } from './ScheduleDialog';

/** The Queue workbench: a read-only preview of a queued post, with its time and what to do. */
export function QueuedPost({ post }: { post: PostDto }) {
  const router = useRouter();
  const navigate = useNavigate();
  const schedulePost = useServerFn(schedulePostFn);
  const unschedulePost = useServerFn(unschedulePostFn);
  const [unscheduling, setUnscheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changeable = post.status === 'scheduled' || post.status === 'failed';

  const reschedule = async (publishAt: Date) => {
    await schedulePost({ data: { id: post.id, publishAt: publishAt.toISOString() } });
    await router.invalidate({ sync: true });
  };

  // Back in the drafts, so open it there: unscheduling is usually the first step of an edit.
  const unschedule = async () => {
    if (unscheduling) return;
    setUnscheduling(true);
    setError(null);
    try {
      await unschedulePost({ data: { id: post.id } });
      await navigate({ to: '/drafts/$draftId', params: { draftId: post.id } });
      await router.invalidate();
      // Unschedule went with this page: the Drafts heading takes focus.
      focusPageHeading();
    } catch (cause) {
      setError(readableError(cause));
      setUnscheduling(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-title-3-semibold text-text-primary">
            {post.publishAt ? <LocalTime value={post.publishAt} format="dateTime" /> : 'No time'}
          </h2>
          <p className="text-body-regular text-text-secondary">
            {post.status === 'failed' ? 'Failed to publish' : 'Scheduled'}
            {post.parts.length > 1 && ` · Thread of ${post.parts.length} posts`}
          </p>
        </div>
        {changeable && (
          <div className="flex flex-wrap items-center gap-2">
            <ButtonRouterLink
              to="/drafts/$draftId"
              params={{ draftId: post.id }}
              variant="secondary"
              leadingIcon={PencilEdit01Icon}
            >
              Edit
            </ButtonRouterLink>
            <Button
              variant="secondary"
              leadingIcon={unscheduling ? Spinner : undefined}
              aria-busy={unscheduling || undefined}
              onClick={unschedule}
            >
              Unschedule
            </Button>
            <ScheduleDialog label="Reschedule" publishAt={post.publishAt} onConfirm={reschedule} />
          </div>
        )}
      </header>
      {/* For a scheduled post, the list pane warns that it won't be sent; below lg the list is
          hidden while a post is open, so the workbench says so instead. */}
      <div className={post.status === 'scheduled' ? 'lg:hidden' : undefined}>
        <PostStatusAlert post={post} />
      </div>
      {error && (
        <Callout tone="error" role="alert" title="Couldn’t unschedule">
          {error}
        </Callout>
      )}
      <PostPreview parts={post.parts} />
    </div>
  );
}
