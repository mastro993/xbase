import { FileAddIcon } from '@hugeicons/core-free-icons';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDraftFn } from '@/features/posts/posts.functions';
import { EmptyState } from '@/features/shell/EmptyState';
import { readableError } from '@/lib/readable-error';

// New draft lands here, then moves on to the draft it creates. The draft is created by the page,
// not a loader: links preload loaders on hover, which would create drafts nobody asked for.
export const Route = createFileRoute('/_authed/drafts/new')({
  component: NewDraft,
});

function NewDraft() {
  const navigate = useNavigate();
  const router = useRouter();
  const createDraft = useServerFn(createDraftFn);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setError(null);
    try {
      const post = await createDraft({ data: { parts: [''] } });
      // Replace: Back goes to where New draft was pressed, not to this page.
      await navigate({ to: '/drafts/$draftId', params: { draftId: post.id }, replace: true });
      // The list stays mounted, so its loader doesn't rerun on its own.
      await router.invalidate({ filter: (match) => match.routeId === '/_authed/drafts' });
    } catch (cause) {
      setError(readableError(cause));
    }
  }, [createDraft, navigate, router]);

  // Once, even when development mode runs effects twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void create();
  }, [create]);

  return (
    <div className="p-6">
      {error ? (
        <EmptyState
          icon={FileAddIcon}
          title="Couldn’t create a draft"
          description={error}
          action={<Button onClick={() => void create()}>Try again</Button>}
        />
      ) : (
        <p role="status" className="text-body-regular text-text-secondary">
          Creating a draft…
        </p>
      )}
    </div>
  );
}
