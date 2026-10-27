import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { SIGN_IN_ERRORS } from '@xbase/core/auth';
import { z } from 'zod';
import { AccountsCard } from '@/features/accounts/AccountsCard';
import { getAiSettingsFn, getVoiceFn } from '@/features/ai/ai.functions';
import { AiProviderCard } from '@/features/ai/AiProviderCard';
import { DecisionCard } from '@/features/ai/DecisionCard';
import { VoiceCard } from '@/features/ai/VoiceCard';
import { listApiKeysFn } from '@/features/api-keys/api-keys.functions';
import { ApiKeysCard } from '@/features/api-keys/ApiKeysCard';
import { getDiscoverySettingsFn } from '@/features/discover/settings/discovery.functions';
import { DiscoverySettings } from '@/features/discover/settings/DiscoverySettings';
import { getMcpSettingsFn } from '@/features/mcp/mcp.functions';
import { McpCard } from '@/features/settings/McpCard';
import { SessionsCard } from '@/features/settings/SessionsCard';
import { FullWidthPage } from '@/features/shell/FullWidthPage';

const authed = getRouteApi('/_authed');

// Mutations call their server function, then router.invalidate() so this loader reads the
// stored result. Secrets never appear here: AI keys stay in the server's environment, API keys
// come back as a prefix. ?accountError= is why adding an X account didn't work.
export const Route = createFileRoute('/_authed/settings')({
  validateSearch: z.object({ accountError: z.enum(SIGN_IN_ERRORS).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: 'Settings · XBase' }] }),
  loader: async () => {
    const [ai, voice, discovery, apiKeys, mcp] = await Promise.all([
      getAiSettingsFn(),
      getVoiceFn(),
      getDiscoverySettingsFn(),
      listApiKeysFn(),
      getMcpSettingsFn(),
    ]);
    return { ai, voice, discovery, apiKeys, mcp };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { ai, voice, discovery, apiKeys, mcp } = Route.useLoaderData();
  const { accountError } = Route.useSearch();
  const accounts = authed.useLoaderData();
  return (
    <FullWidthPage
      title="Settings"
      description="Your X accounts, AI writing, reply discovery, access for other apps, and where you’re signed in."
    >
      <AccountsCard data={accounts} error={accountError} />
      <AiProviderCard settings={ai} />
      {/* Keyed by account: switching accounts loads another voice into a fresh form. */}
      <VoiceCard key={accounts.current.id} voice={voice} username={accounts.current.username} />
      <DecisionCard model={ai.decision} />
      {/* Also per account: another account loads its own niches, thresholds and filters. */}
      <DiscoverySettings key={accounts.current.id} settings={discovery} />
      <ApiKeysCard keys={apiKeys} />
      <McpCard settings={mcp} />
      <SessionsCard />
    </FullWidthPage>
  );
}
