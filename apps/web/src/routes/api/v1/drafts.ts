import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed, readJson, withApiKey } from '@/features/api-keys/rest.server';
import { ApiDraftInput, ListDraftsQuery } from '@/features/posts/posts.schema';
import { createDraft, listDrafts } from '@/features/posts/posts.server';
import { parseInput } from '@/lib/validate';
import { json } from '@/server/http';

export const Route = createFileRoute('/api/v1/drafts')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, () => {
          const query = Object.fromEntries(new URL(request.url).searchParams);
          return json({ items: listDrafts(parseInput(ListDraftsQuery, query)) });
        }),
      POST: ({ request }) =>
        withApiKey(request, async () => {
          const { parts } = parseInput(ApiDraftInput, await readJson(request));
          return json(createDraft({ parts, origin: 'api' }), { status: 201 });
        }),
      ANY: methodNotAllowed('GET, POST'),
    },
  },
});
