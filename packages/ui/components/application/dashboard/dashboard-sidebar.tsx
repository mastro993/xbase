'use client';

import { RiCloseLine } from '@remixicon/react';
import { Tooltip, TooltipTrigger } from '@xbase/ui/components/base/tooltip/tooltip';
import { cx, sortCx } from '@xbase/ui/utils/cx';
import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type DOMAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Dialog as AriaDialog,
  Focusable as AriaFocusable,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  type FocusableElement,
} from 'react-aria-components';

/**
 * Figma sources:
 *   expanded  → Board UI → dashboard 1 → Sidebar (node 3731:2934)
 *   collapsed → Board UI → Sidebar (node 3768:3382)
 *
 * Floating sidebar panel. Expanded: 260px wide, p 12, radius/3xl (24px),
 * white 1px border, "Background/Sidebar Elevation" shadow, bg
 * background/secondary. Collapsed: 60px wide (36px icon items + 12px
 * padding); nav items become icon-only squares.
 *
 * XBase: trimmed to an app's own navigation. The team and account menus,
 * quick search, theme toggle (the OS decides), settings modal and demo nav
 * are gone, and so is the collapse toggle: `collapsed` is a prop, the icon
 * rail. The panel takes its rows as children, so an app renders its router's
 * links on `SidebarNavItem` (TanStack's `createLink(SidebarNavItem)`): the
 * selected look follows the link's `aria-current="page"`. Collapsed rows show
 * their label in a tooltip. `SidebarDrawer` holds the expanded panel on small
 * screens, where BoardUI's `mobile` mode expects a drawer.
 *
 *   <DashboardSidebar collapsed logo={<Mark />} footer={<AccountMenu />}>
 *     <NavLink to="/drafts" icon={RiDraftLine} label="Drafts" />
 *   </DashboardSidebar>
 */

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

const SidebarContext = createContext({ collapsed: false });

/**
 * Collapsible text slot: blurs + fades + shrinks away when the rail closes.
 * The icons stay pinned in place — only the label animates — so nothing jumps
 * to center. Still in the accessibility tree while hidden.
 */
function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        'flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out motion-reduce:transition-none',
        collapsed ? 'max-w-0 opacity-0 blur-[3px]' : 'blur-0 max-w-full opacity-100',
      )}
    >
      {children}
    </span>
  );
}

const styles = sortCx({
  // The selected row (aria-current="page") takes the accent fill; its icon and
  // label turn white through the group.
  row: [
    'group flex items-center overflow-hidden rounded-2lg p-2 text-start',
    'cursor-pointer transition-[width,background-color] duration-300 ease-in-out',
    // XBase: ring-offset-2, so the selected row's ring doesn't merge into its accent fill.
    'outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring',
    'hover:bg-background-secondary-hover',
    'aria-[current=page]:bg-linear-to-b aria-[current=page]:from-accent-500 aria-[current=page]:to-accent-600 aria-[current=page]:shadow-nav-selected',
  ].join(' '),
  rowWidth: { collapsed: 'w-9', expanded: 'w-full' },
  content: 'flex min-w-0 items-center gap-2',
  icon: 'size-5 shrink-0 text-foreground-icon-secondary group-aria-[current=page]:text-text-white',
  label:
    'text-body-medium whitespace-nowrap text-text-secondary group-aria-[current=page]:text-text-white',
});

function RowContent({
  icon: Icon,
  label,
  collapsed,
}: {
  icon: IconComponent;
  label: string;
  collapsed: boolean;
}) {
  return (
    <span className={styles.content}>
      <Icon className={styles.icon} aria-hidden />
      <Collapsible collapsed={collapsed}>
        <span className={styles.label}>{label}</span>
      </Collapsible>
    </span>
  );
}

/** In the icon rail, the row's label shows beside it on hover and keyboard focus. */
function RailTooltip({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean;
  label: string;
  children: ReactElement<DOMAttributes<FocusableElement>, string>;
}) {
  if (!collapsed) return children;
  return (
    <TooltipTrigger>
      <AriaFocusable>{children}</AriaFocusable>
      <Tooltip placement="end">{label}</Tooltip>
    </TooltipTrigger>
  );
}

export interface SidebarNavItemProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'children'
> {
  icon: IconComponent;
  label: string;
  ref?: Ref<HTMLAnchorElement>;
}

/** A navigation row; selected while it carries `aria-current="page"`. */
export function SidebarNavItem({ icon, label, className, ref, ...props }: SidebarNavItemProps) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <RailTooltip collapsed={collapsed} label={label}>
      <a
        ref={ref}
        {...props}
        className={cx(
          styles.row,
          collapsed ? styles.rowWidth.collapsed : styles.rowWidth.expanded,
          className,
        )}
      >
        <RowContent icon={icon} label={label} collapsed={collapsed} />
      </a>
    </RailTooltip>
  );
}

export interface DashboardSidebarProps {
  /** The app's mark, at the top. */
  logo?: ReactNode;
  /** The navigation rows: SidebarNavItem, or a router link built on it. */
  children: ReactNode;
  /** Pinned under the navigation, e.g. an account menu. */
  footer?: ReactNode;
  /** The 60px icon rail: labels hide and show as tooltips. */
  collapsed?: boolean;
  /** Inside SidebarDrawer: always expanded, with a close button. */
  mobile?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  /** The navigation landmark's name. */
  navLabel?: string;
  className?: string;
}

export function DashboardSidebar({
  logo,
  children,
  footer,
  collapsed: collapsedProp = false,
  mobile = false,
  onClose,
  closeLabel = 'Close navigation',
  navLabel = 'Main',
  className,
}: DashboardSidebarProps) {
  const collapsed = mobile ? false : collapsedProp;
  return (
    <SidebarContext.Provider value={collapsed ? COLLAPSED : EXPANDED}>
      <aside
        className={cx(
          'flex h-full shrink-0 flex-col gap-3 overflow-hidden',
          'rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar',
          'transition-[width] duration-300 ease-in-out motion-reduce:transition-none',
          // Collapsed rail keeps the 60px spec: 1px border + 11px padding on each
          // side leaves an exactly 36px column so the w-9 (36px) icon items center.
          collapsed ? 'w-[60px] px-[11px] py-3' : 'w-[260px] p-3',
          className,
        )}
      >
        {(logo || mobile) && (
          <div className="flex w-full items-center justify-between gap-2">
            {logo}
            {mobile && (
              <button
                type="button"
                aria-label={closeLabel}
                onClick={onClose}
                className="flex size-9 cursor-pointer items-center justify-center rounded-2lg text-foreground-icon-secondary outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <RiCloseLine className="size-5" aria-hidden />
              </button>
            )}
          </div>
        )}
        {/* `overflow-y: auto` clips the x axis too, so the selected row's ring
            and focus rings landed outside it. Padding moves the clip edge out;
            the matching negative margin borrows that space back, leaving every
            row exactly where it was. */}
        <nav
          aria-label={navLabel}
          className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-1 [scrollbar-width:none] flex-col gap-1 overflow-y-auto p-2"
        >
          {children}
        </nav>
        {footer && <div className="flex w-full shrink-0 flex-col gap-1">{footer}</div>}
      </aside>
    </SidebarContext.Provider>
  );
}

const COLLAPSED = { collapsed: true };
const EXPANDED = { collapsed: false };

export interface SidebarDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The drawer's accessible name. */
  'aria-label'?: string;
  /** A `<DashboardSidebar mobile onClose={…}>`. */
  children: ReactNode;
}

/**
 * The sidebar on small screens: a modal drawer at the start edge. React Aria
 * traps focus, closes on Escape and on a press outside, and returns focus to
 * the button that opened it. Motion is the motion.md modal recipe, condensing
 * from the start edge.
 */
export function SidebarDrawer({
  isOpen,
  onOpenChange,
  'aria-label': label = 'Navigation',
  children,
}: SidebarDrawerProps) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={cx(
        'fixed inset-0 z-50 bg-black/70',
        'transition-opacity duration-300 ease-out motion-reduce:transition-none',
        'data-[entering]:opacity-0 data-[exiting]:opacity-0',
      )}
    >
      <AriaModal
        className={cx(
          'fixed inset-y-0 start-0 flex max-w-full p-3 outline-none ltr:origin-left rtl:origin-right',
          'transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter] motion-reduce:transition-none',
          'data-[entering]:scale-[0.85] data-[entering]:opacity-0 data-[entering]:blur-[4px]',
          'data-[exiting]:scale-[0.85] data-[exiting]:opacity-0 data-[exiting]:blur-[4px]',
        )}
      >
        <AriaDialog aria-label={label} className="h-full max-w-full outline-none">
          {children}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
