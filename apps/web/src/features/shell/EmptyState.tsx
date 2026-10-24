import type { ComponentType, ReactNode } from 'react';

type EmptyStateProps = {
  /** A Remix Icon component reference, e.g. `RiDraftLine`. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** An h2: the page's h1 sits above it. */
  title: string;
  description: ReactNode;
  /** A call to action: a Button, or a ButtonRouterLink. */
  action?: ReactNode;
};

/** What a page or pane shows when it has nothing to show yet: a centred card. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-border-button-default bg-background-primary-default px-6 py-10 text-center">
      {Icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-background-secondary-default">
          <Icon aria-hidden className="size-6 text-foreground-icon-secondary" />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
        <div className="text-body-regular text-text-secondary">{description}</div>
      </div>
      {action}
    </div>
  );
}
