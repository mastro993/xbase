import { RiDraftLine } from '@remixicon/react';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { NewDraftButton } from '@/features/posts/NewDraftButton';
import { EmptyState } from '@/features/shell/EmptyState';

const drafts = getRouteApi('/_authed/drafts');

export const Route = createFileRoute('/_authed/drafts/')({
  component: NoDraftOpen,
});

function NoDraftOpen() {
  const hasDrafts = drafts.useLoaderData().length > 0;
  return (
    <div className="p-6">
      <EmptyState
        icon={RiDraftLine}
        title={hasDrafts ? 'Pick a draft to edit' : 'Write your first draft'}
        description="Write a post or a thread, refine it with AI, then schedule it. Drafts made through the API or MCP show up here too."
        action={<NewDraftButton />}
      />
    </div>
  );
}
