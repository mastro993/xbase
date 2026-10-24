import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, readJson, withApiKey } from '@/features/api-keys/rest.server';
import { ApiDraftInput } from '@/features/posts/posts.schema';
import { deletePost, getPost, updateDraft } from '@/features/posts/posts.server';
import { parseInput } from '@/lib/validate';
import { json } from '@/server/http';

// Any of the owner's posts by id; posts on their way to X or already there can't be changed (409).
export const Route = createFileRoute('/api/v1/drafts/$draftId')({
  server: {
    handlers: {
      GET: ({ request, params }) => withApiKey(request, () => json(getPost(params.draftId))),
      PATCH: ({ request, params }) =>
        withApiKey(request, async () => {
          const { parts } = parseInput(ApiDraftInput, await readJson(request));
          return json(updateDraft(params.draftId, { parts }));
        }),
      DELETE: ({ request, params }) =>
        withApiKey(request, () => {
          deletePost(params.draftId);
          return new Response(null, { status: 204 });
        }),
      ANY: methodNotAllowed('GET, PATCH, DELETE'),
    },
  },
});
