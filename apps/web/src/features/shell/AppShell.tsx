import {
  RiBarChartBoxLine,
  RiCalendarScheduleLine,
  RiCompass3Line,
  RiDraftLine,
  RiLogoutBoxRLine,
  RiMenuLine,
  RiSettings4Line,
} from '@remixicon/react';
import { createLink, Link } from '@tanstack/react-router';
import {
  DashboardSidebar,
  SidebarDrawer,
  SidebarNavButton,
  SidebarNavItem,
} from '@xbase/ui/components/application/dashboard/dashboard-sidebar';
import { IconButton } from '@xbase/ui/components/base/buttons/icon-button';
import { type ReactNode, useState } from 'react';
import { logoutFn } from '@/features/auth/auth.functions';
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

// A native POST, with or without JavaScript: the server ends the session and redirects to /login.
// Leaving the page this way lets the browser ask first when a draft has unsaved changes, before
// anything is sent; a client-side sign-out would end the session before the composer could ask.
function SignOutButton() {
  return (
    <form method="post" action={logoutFn.url}>
      <SidebarNavButton type="submit" icon={RiLogoutBoxRLine} label="Sign out" />
    </form>
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
 * the rail gives way to a top bar whose button opens the sidebar in a drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
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
        <DashboardSidebar collapsed logo={<HomeLink />} footer={<SignOutButton />}>
          <NavLinks />
        </DashboardSidebar>
      </div>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      <SidebarDrawer isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
        <DashboardSidebar
          mobile
          onClose={closeDrawer}
          logo={<HomeLink named onNavigate={closeDrawer} />}
          footer={<SignOutButton />}
        >
          <NavLinks onNavigate={closeDrawer} />
        </DashboardSidebar>
      </SidebarDrawer>
    </div>
  );
}
