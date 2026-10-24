import { createFileRoute, Outlet, useMatch } from '@tanstack/react-router';
import { listScheduledFn } from '@/features/posts/posts.functions';
import { QueueList } from '@/features/posts/QueueList';
import { SplitView } from '@/features/shell/SplitView';

// Like Drafts: changes call router.invalidate() so this list reloads.
export const Route = createFileRoute('/_authed/queue')({
  head: () => ({ meta: [{ title: 'Queue · XBase' }] }),
  loader: () => listScheduledFn(),
  component: QueueLayout,
});

function QueueLayout() {
  const posts = Route.useLoaderData();
  const detail = !!useMatch({ from: '/_authed/queue/$postId', shouldThrow: false });
  return (
    <SplitView title="Queue" list={<QueueList posts={posts} />} detail={detail} backTo="/queue">
      <Outlet />
    </SplitView>
  );
}
