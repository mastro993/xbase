import { createFileRoute } from '@tanstack/react-router';
import { getAiSettingsFn } from '@/features/ai/ai.functions';
import { AiProviderCard } from '@/features/ai/AiProviderCard';

export const Route = createFileRoute('/_authed/settings/ai/provider')({
  head: () => ({ meta: [{ title: 'AI provider · Settings · XBase' }] }),
  loader: () => getAiSettingsFn(),
  component: ProviderPage,
});

function ProviderPage() {
  const settings = Route.useLoaderData();
  return <AiProviderCard settings={settings} />;
}
