import { createFileRoute } from '@tanstack/react-router';
import { ApiDraftInput } from '@xbase/core/posts/schema';
import { parseInput } from '@xbase/core/validate';
import { json } from '@xbase/server/http';
import { deletePost, getPost, updateDraft } from '@xbase/server/posts';
import { methodNotAllowed, readJson, withApiKey } from '@xbase/server/rest';

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
