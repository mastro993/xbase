import { createFileRoute } from '@tanstack/react-router';
import { getAiSettingsFn } from '@/features/ai/ai.functions';
import { DecisionCard } from '@/features/ai/DecisionCard';

export const Route = createFileRoute('/_authed/settings/ai/decision')({
  head: () => ({ meta: [{ title: 'Decision model · Settings · XBase' }] }),
  loader: () => getAiSettingsFn(),
  component: DecisionPage,
});

function DecisionPage() {
  const settings = Route.useLoaderData();
  return <DecisionCard settings={settings} />;
}
