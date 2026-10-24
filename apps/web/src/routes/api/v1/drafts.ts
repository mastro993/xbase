import { createFileRoute } from '@tanstack/react-router';
import { accountFilter, resolveAccountId } from '@/features/accounts/accounts.server';
import { methodNotAllowed, readJson, withApiKey } from '@/features/api-keys/rest.server';
import { ApiNewDraftInput, ListDraftsQuery } from '@/features/posts/posts.schema';
import { createDraft, listDrafts } from '@/features/posts/posts.server';
import { parseInput } from '@/lib/validate';
import { json } from '@/server/http';

// ?account= narrows the list to one account. A new draft goes to `account`, which may be left out
// while only one account is linked.
export const Route = createFileRoute('/api/v1/drafts')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, () => {
          const query = Object.fromEntries(new URL(request.url).searchParams);
          const { limit, account } = parseInput(ListDraftsQuery, query);
          return json({ items: listDrafts({ accountId: accountFilter(account), limit }) });
        }),
      POST: ({ request }) =>
        withApiKey(request, async () => {
          const { parts, account } = parseInput(ApiNewDraftInput, await readJson(request));
          const accountId = resolveAccountId(account);
          return json(createDraft({ accountId, parts, origin: 'api' }), { status: 201 });
        }),
      ANY: methodNotAllowed('GET, POST'),
    },
  },
});
