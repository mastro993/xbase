import { createFileRoute, Outlet, useMatch } from '@tanstack/react-router';
import { MAX_LIST_LIMIT } from '@xbase/core/posts/schema';
import { DraftList } from '@/features/posts/DraftList';
import { NewDraftButton } from '@/features/posts/NewDraftButton';
import { listDraftsFn } from '@/features/posts/posts.functions';
import { SplitView } from '@/features/shell/SplitView';

// The list pane stays mounted while drafts open beside it, so its loader doesn't rerun on its
// own: every change calls router.invalidate() after its server function.
export const Route = createFileRoute('/_authed/drafts')({
  head: () => ({ meta: [{ title: 'Drafts · XBase' }] }),
  // The server's maximum; the list says so when it's full.
  loader: () => listDraftsFn({ data: { limit: MAX_LIST_LIMIT } }),
  component: DraftsLayout,
});

function DraftsLayout() {
  const drafts = Route.useLoaderData();
  const draft = useMatch({ from: '/_authed/drafts/$draftId', shouldThrow: false });
  const creating = useMatch({ from: '/_authed/drafts/new', shouldThrow: false });
  return (
    <SplitView
      title="Drafts"
      action={<NewDraftButton size="small" />}
      list={<DraftList drafts={drafts} />}
      detail={!!draft || !!creating}
      backTo="/drafts"
    >
      <Outlet />
    </SplitView>
  );
}
