import { createFileRoute } from '@tanstack/react-router';
import { listApiKeysFn } from '@/features/api-keys/api-keys.functions';
import { ApiKeysCard } from '@/features/api-keys/ApiKeysCard';

export const Route = createFileRoute('/_authed/settings/integrations/api-keys')({
  head: () => ({ meta: [{ title: 'API keys · Settings · XBase' }] }),
  loader: () => listApiKeysFn(),
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const keys = Route.useLoaderData();
  return <ApiKeysCard keys={keys} />;
}
