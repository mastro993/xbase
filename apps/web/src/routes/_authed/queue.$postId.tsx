import { createFileRoute } from '@tanstack/react-router';
import { NotQueued } from '@/features/posts/PostNotFound';
import { getPostFn } from '@/features/posts/posts.functions';
import { QueuedPost } from '@/features/posts/QueuedPost';

export const Route = createFileRoute('/_authed/queue/$postId')({
  loader: ({ params }) => getPostFn({ data: { id: params.postId } }),
  component: QueuedPostPage,
  notFoundComponent: () => <NotQueued />,
});

function QueuedPostPage() {
  const post = Route.useLoaderData();
  // An old link to a post that has since gone back to the drafts, or out to X.
  if (!post.publishAt || post.status === 'draft' || post.status === 'published') {
    return <NotQueued draftId={post.status === 'published' ? undefined : post.id} />;
  }
  return <QueuedPost key={post.id} post={post} />;
}
