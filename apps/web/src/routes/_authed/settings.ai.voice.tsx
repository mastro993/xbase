import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { getVoiceFn } from '@/features/ai/ai.functions';
import { VoiceCard } from '@/features/ai/VoiceCard';

const authed = getRouteApi('/_authed');

export const Route = createFileRoute('/_authed/settings/ai/voice')({
  head: () => ({ meta: [{ title: 'Voice · Settings · XBase' }] }),
  loader: () => getVoiceFn(),
  component: VoicePage,
});

function VoicePage() {
  const voice = Route.useLoaderData();
  const { current } = authed.useLoaderData();
  // Keyed by account: switching accounts loads another voice into a fresh form.
  return <VoiceCard key={current.id} voice={voice} username={current.username} />;
}
