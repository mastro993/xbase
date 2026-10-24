import { createFileRoute } from '@tanstack/react-router';
import { getAiSettingsFn } from '@/features/ai/ai.functions';
import { Composer } from '@/features/posts/Composer';
import { DraftNotFound } from '@/features/posts/PostNotFound';
import { getPostFn } from '@/features/posts/posts.functions';

// Any status opens here: drafts, and queued posts from the Queue's Edit. getPostFn throws
// notFound() for an unknown id.
export const Route = createFileRoute('/_authed/drafts/$draftId')({
  loader: async ({ params }) => {
    const [post, ai] = await Promise.all([
      getPostFn({ data: { id: params.draftId } }),
      getAiSettingsFn(),
    ]);
    return { post, aiReady: ai !== null };
  },
  component: DraftPage,
  notFoundComponent: DraftNotFound,
});

function DraftPage() {
  const { post, aiReady } = Route.useLoaderData();
  // A new key for another post resets the composer's unsaved texts.
  return <Composer key={post.id} post={post} aiReady={aiReady} />;
}
