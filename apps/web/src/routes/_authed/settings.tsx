import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { SettingsModal } from '@xbase/ui/components/application/settings/settings-modal';
import { useEffect, useRef, useState } from 'react';
import {
  SETTINGS_PAGES,
  SETTINGS_SECTIONS,
  type SettingsPageId,
  settingsPageForPath,
} from '@/features/settings/settings-pages';

// Settings replaces the current page while open: the routes below still load their own data and
// keep a linkable URL, while the modal supplies the grouped rail and the page title. Closing
// returns to the page it opened from.
export const Route = createFileRoute('/_authed/settings')({
  component: SettingsLayout,
});

const CLOSE_MS = 320;

/** Settings' route shell: the BoardUI settings modal, replacing the current page while open. */
function SettingsLayout() {
  const navigate = useNavigate();
  const locationState = useRouterState({ select: (state) => state.location.state });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = settingsPageForPath(pathname);
  const [open, setOpen] = useState(true);
  // Where closing goes, captured on mount so moving between pages doesn't change it. The shell's
  // Settings link put the page it came from in the navigation state.
  const [returnTo] = useState(() => {
    const from = locationState?.settingsReturnTo;
    return typeof from === 'string' && !from.startsWith('/settings') ? from : '/';
  });
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // Let the panel's exit transition play, then return to the page that opened Settings.
  const close = () => {
    if (closeTimer.current !== null) return;
    setOpen(false);
    closeTimer.current = window.setTimeout(() => void navigate({ href: returnTo }), CLOSE_MS);
  };

  const go = (id: string) => {
    if (!Object.hasOwn(SETTINGS_PAGES, id)) return;
    // Keep the return target in the history state as the pages change.
    void navigate({ to: SETTINGS_PAGES[id as SettingsPageId].to, state: true });
  };

  return (
    <SettingsModal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      page={current}
      onPageChange={go}
      sections={SETTINGS_SECTIONS}
      title={SETTINGS_PAGES[current].label}
    >
      <div className="flex flex-col gap-6">
        <Outlet />
      </div>
    </SettingsModal>
  );
}
