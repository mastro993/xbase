import {
  RiBarChartBoxLine,
  RiCalendarScheduleLine,
  RiCompass3Line,
  RiDraftLine,
  RiMenuLine,
  RiSettings4Line,
} from '@remixicon/react';
import { createLink, Link } from '@tanstack/react-router';
import {
  DashboardSidebar,
  SidebarDrawer,
  SidebarNavItem,
} from '@xbase/ui/components/application/dashboard/dashboard-sidebar';
import { IconButton } from '@xbase/ui/components/base/buttons/icon-button';
import { type ReactNode, useState } from 'react';
import { AccountMenu } from '@/features/accounts/AccountMenu';
import type { AccountsDto } from '@/features/accounts/accounts.schema';
import { AppMark } from './AppMark';

// A TanStack Link on the sidebar's row: the current section (child routes included) gets
// aria-current="page", which the row shows as selected.
const NavLink = createLink(SidebarNavItem);

const PAGES = [
  { to: '/discover', label: 'Discover', icon: RiCompass3Line },
  { to: '/drafts', label: 'Drafts', icon: RiDraftLine },
  { to: '/queue', label: 'Queue', icon: RiCalendarScheduleLine },
  { to: '/stats', label: 'Stats', icon: RiBarChartBoxLine },
] as const;

/** The sections, with Settings at the bottom. In the drawer, following a link closes it. */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {PAGES.map((page) => (
        <NavLink
          key={page.to}
          to={page.to}
          icon={page.icon}
          label={page.label}
          onClick={onNavigate}
        />
      ))}
      <NavLink
        to="/settings"
        icon={RiSettings4Line}
        label="Settings"
        onClick={onNavigate}
        className="mt-auto"
      />
    </>
  );
}

/** The mark, linking home; with the app's name where there's room. */
function HomeLink({ named = false, onNavigate }: { named?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to="/"
      // `/` only redirects, so it's never the current page.
      activeOptions={{ exact: true }}
      aria-label="XBase home"
      onClick={onNavigate}
      // The ring sits 2px off the mark's accent fill, so it doesn't merge into it.
      className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2"
    >
      <AppMark />
      {named && <span className="text-body-semibold text-text-primary">XBase</span>}
    </Link>
  );
}

/**
 * The signed-in layout: BoardUI's sidebar as an icon rail, then the page. Below the md breakpoint
 * the rail gives way to a top bar whose button opens the sidebar in a drawer. The account menu,
 * with sign-out, sits at the foot of the sidebar.
 */
export function AppShell({ accounts, children }: { accounts: AccountsDto; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  return (
    <div className="flex h-svh flex-col md:flex-row">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-separator-border px-3 md:hidden">
        <IconButton
          icon={RiMenuLine}
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        />
        <HomeLink named />
      </header>
      <div className="hidden shrink-0 p-3 pe-0 md:flex">
        <DashboardSidebar
          collapsed
          logo={<HomeLink />}
          footer={<AccountMenu data={accounts} collapsed />}
        >
          <NavLinks />
        </DashboardSidebar>
      </div>
      {/* relative: absolutely positioned content (sr-only status lines) would otherwise escape this
          scroll box and stretch the page itself, adding a second scroll into blank space. */}
      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      <SidebarDrawer isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
        <DashboardSidebar
          mobile
          onClose={closeDrawer}
          logo={<HomeLink named onNavigate={closeDrawer} />}
          footer={<AccountMenu data={accounts} collapsed={false} />}
        >
          <NavLinks onNavigate={closeDrawer} />
        </DashboardSidebar>
      </SidebarDrawer>
    </div>
  );
}
