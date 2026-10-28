import {
  AiBrain01Icon,
  AiVoice01Icon,
  Analytics01Icon,
  BalanceScaleIcon,
  FilterHorizontalIcon,
  HashtagIcon,
  RssConnected01Icon,
  Key01Icon,
  McpServerIcon,
  ShieldCheckIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import type { LinkProps } from '@tanstack/react-router';
import type { SettingsNavSection } from '@xbase/ui/components/application/settings/settings-modal';

// Every settings page, in the order the modal's rail shows them. A page's `to` is its route, so
// the rail, the page title and the open URL all come from this one list.
export const SETTINGS_PAGES = {
  accounts: { label: 'Accounts', to: '/settings' },
  sessions: { label: 'Sessions', to: '/settings/sessions' },
  provider: { label: 'Provider', to: '/settings/ai/provider' },
  voice: { label: 'Voice', to: '/settings/ai/voice' },
  decision: { label: 'Decision model', to: '/settings/ai/decision' },
  topics: { label: 'Topics', to: '/settings/discovery/topics' },
  sources: { label: 'Sources', to: '/settings/discovery/sources' },
  filters: { label: 'Filters', to: '/settings/discovery/filters' },
  'x-api': { label: 'X API', to: '/settings/integrations/x-api' },
  'api-keys': { label: 'API keys', to: '/settings/integrations/api-keys' },
  mcp: { label: 'MCP', to: '/settings/integrations/mcp' },
} as const satisfies Record<string, { label: string; to: LinkProps['to'] }>;

export type SettingsPageId = keyof typeof SETTINGS_PAGES;

/** The row's id and label, from the single page list. The icon says what the page is. */
const navItem = (id: SettingsPageId) => ({ id, label: SETTINGS_PAGES[id].label });

export const SETTINGS_SECTIONS = [
  {
    label: 'Account',
    items: [
      { ...navItem('accounts'), icon: UserMultiple02Icon },
      { ...navItem('sessions'), icon: ShieldCheckIcon },
    ],
  },
  {
    label: 'AI',
    items: [
      { ...navItem('provider'), icon: AiBrain01Icon },
      { ...navItem('voice'), icon: AiVoice01Icon },
      { ...navItem('decision'), icon: BalanceScaleIcon },
    ],
  },
  {
    label: 'Discovery',
    items: [
      { ...navItem('topics'), icon: HashtagIcon },
      { ...navItem('sources'), icon: RssConnected01Icon },
      { ...navItem('filters'), icon: FilterHorizontalIcon },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { ...navItem('x-api'), icon: Analytics01Icon },
      { ...navItem('api-keys'), icon: Key01Icon },
      { ...navItem('mcp'), icon: McpServerIcon },
    ],
  },
] satisfies SettingsNavSection[];

const BY_PATH = new Map<string, SettingsPageId>(
  Object.entries(SETTINGS_PAGES).map(([id, page]) => [page.to, id as SettingsPageId] as const),
);

/** The page a settings URL shows; anything else opens the default, Accounts. */
export function settingsPageForPath(pathname: string): SettingsPageId {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return BY_PATH.get(path) ?? 'accounts';
}

declare module '@tanstack/history' {
  interface HistoryState {
    /** Where the settings modal returns when it closes; set by the Settings link. */
    settingsReturnTo?: string;
  }
}
