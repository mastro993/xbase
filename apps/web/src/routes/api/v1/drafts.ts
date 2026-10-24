import { createFileRoute } from '@tanstack/react-router';
import { ApiNewDraftInput, ListDraftsQuery } from '@xbase/core/posts/schema';
import { parseInput } from '@xbase/core/validate';
import { accountFilter, resolveAccountId } from '@xbase/server/accounts';
import { json } from '@xbase/server/http';
import { createDraft, listDrafts } from '@xbase/server/posts';
import { methodNotAllowed, readJson, withApiKey } from '@xbase/server/rest';

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
