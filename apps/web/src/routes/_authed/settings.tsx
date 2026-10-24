import { createFileRoute } from '@tanstack/react-router';
import { getAiSettingsFn, getVoiceFn } from '@/features/ai/ai.functions';
import { AiProviderCard } from '@/features/ai/AiProviderCard';
import { VoiceCard } from '@/features/ai/VoiceCard';
import { listApiKeysFn } from '@/features/api-keys/api-keys.functions';
import { ApiKeysCard } from '@/features/api-keys/ApiKeysCard';
import { getMcpSettingsFn } from '@/features/mcp/mcp.functions';
import { McpCard } from '@/features/settings/McpCard';
import { SessionsCard } from '@/features/settings/SessionsCard';
import { FullWidthPage } from '@/features/shell/FullWidthPage';

// Mutations call their server function, then router.invalidate() so this loader reads the
// stored result. Secrets never appear here: AI keys come back as a hint, API keys as a prefix.
export const Route = createFileRoute('/_authed/settings')({
  head: () => ({ meta: [{ title: 'Settings · XBase' }] }),
  loader: async () => {
    const [ai, voice, apiKeys, mcp] = await Promise.all([
      getAiSettingsFn(),
      getVoiceFn(),
      listApiKeysFn(),
      getMcpSettingsFn(),
    ]);
    return { ai, voice, apiKeys, mcp };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { ai, voice, apiKeys, mcp } = Route.useLoaderData();
  return (
    <FullWidthPage
      title="Settings"
      description="AI writing, access for other apps, and where you’re signed in."
    >
      <AiProviderCard settings={ai} />
      <VoiceCard voice={voice} />
      <ApiKeysCard keys={apiKeys} />
      <McpCard settings={mcp} />
      <SessionsCard />
    </FullWidthPage>
  );
}
