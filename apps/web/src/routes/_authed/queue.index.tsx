import { RiCalendarScheduleLine } from '@remixicon/react';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { EmptyState } from '@/features/shell/EmptyState';
import { ButtonRouterLink } from '@/features/shell/router-links';

const queue = getRouteApi('/_authed/queue');

export const Route = createFileRoute('/_authed/queue/')({
  component: NoPostOpen,
});

function NoPostOpen() {
  const empty = queue.useLoaderData().length === 0;
  return (
    <div className="p-6">
      <EmptyState
        icon={RiCalendarScheduleLine}
        title={empty ? 'Nothing scheduled' : 'Pick a scheduled post'}
        description={
          empty
            ? 'Schedule a draft and it waits here, under its day, until its time.'
            : 'Preview it, change its time, or take it back to your drafts.'
        }
        action={
          empty && (
            <ButtonRouterLink to="/drafts" variant="secondary">
              Go to drafts
            </ButtonRouterLink>
          )
        }
      />
    </div>
  );
}
