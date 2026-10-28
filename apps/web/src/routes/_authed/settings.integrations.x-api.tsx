import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { BudgetCard } from '@/features/discover/settings/BudgetCard';
import { getDiscoverySettingsFn } from '@/features/discover/settings/discovery.functions';
import { getXApiUsageFn } from '@/features/x-api/x-api.functions';
import { XApiCard } from '@/features/x-api/XApiCard';

const authed = getRouteApi('/_authed');

export const Route = createFileRoute('/_authed/settings/integrations/x-api')({
  head: () => ({ meta: [{ title: 'X API · Settings · XBase' }] }),
  loader: async () => {
    const [usage, discovery] = await Promise.all([getXApiUsageFn(), getDiscoverySettingsFn()]);
    return { usage, discovery };
  },
  component: XApiPage,
});

function XApiPage() {
  const { usage, discovery } = Route.useLoaderData();
  const { current } = authed.useLoaderData();
  const currentUsage = usage.accounts.find(({ id }) => id === current.id);
  return (
    <>
      <XApiCard usage={usage} />
      {/* The workspace caps above are the hard limit; this account can set lower ones here. */}
      <BudgetCard key={current.id} settings={discovery.budget} usage={currentUsage} />
    </>
  );
}
