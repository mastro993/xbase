import { RiArrowLeftLine } from '@remixicon/react';
import type { LinkProps } from '@tanstack/react-router';
import { cx } from '@xbase/ui/utils/cx';
import type { ReactNode } from 'react';
import { IconButtonRouterLink } from './router-links';

type SplitViewProps = {
  /** The page's h1, at the top of the list pane. */
  title: string;
  /** The page's primary action, beside the title. */
  action?: ReactNode;
  list: ReactNode;
  /** The workbench, usually the route's <Outlet />. */
  children: ReactNode;
  /**
   * Whether a detail route fills the workbench. Below the lg breakpoint only one pane shows:
   * the list, or the workbench while this is true, with a link back to `backTo`.
   */
  detail?: boolean;
  backTo?: LinkProps['to'];
};

/**
 * A list pane beside a workbench, each scrolling on its own. On wide screens the list pane floats
 * beside the rail like BoardUI's sidebar panel; below lg it's flat, and its header (with the h1)
 * stays when the workbench replaces the list.
 */
export function SplitView({
  title,
  action,
  list,
  children,
  detail = false,
  backTo,
}: SplitViewProps) {
  return (
    <div className="flex h-full flex-col lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <div
        className={cx(
          'flex min-h-0 flex-col',
          'lg:my-3 lg:ms-3 lg:overflow-hidden lg:rounded-3xl lg:border lg:border-border-button-white lg:bg-background-secondary-default lg:shadow-sidebar',
          !detail && 'flex-1',
        )}
      >
        <header className="flex min-h-15 shrink-0 items-center gap-2 border-b border-separator-border px-4 py-3">
          {detail && backTo !== undefined && (
            <IconButtonRouterLink
              to={backTo}
              // A detail page sits under backTo, which would otherwise mark Back as the current page.
              activeOptions={{ exact: true }}
              icon={RiArrowLeftLine}
              aria-label={`Back to ${title}`}
              size="small"
              className="lg:hidden"
            />
          )}
          {/* Focusable: where focus goes when the open item is deleted (focusPageHeading). */}
          <h1
            tabIndex={-1}
            data-page-heading=""
            className="min-w-0 flex-1 truncate text-title-3-semibold text-text-primary outline-none"
          >
            {title}
          </h1>
          {action}
        </header>
        <div className={cx('min-h-0 flex-1 overflow-y-auto lg:block', detail ? 'hidden' : 'block')}>
          {list}
        </div>
      </div>
      <div
        className={cx(
          'min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex',
          detail ? 'flex' : 'hidden',
        )}
      >
        {children}
      </div>
    </div>
  );
}
