import {
  RiAlertFill,
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiInformationFill,
} from '@remixicon/react';
import { cx, sortCx } from '@xbase/ui/utils/cx';
import type { ComponentType, HTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Why it exists: BoardUI's notification is a floating, dismissible toast with no warning tone, and
 * the free registry has no inline status note.
 *
 * A note on the tray surface: the tone's icon in BoardUI's notification disc colours, an optional
 * title, the message, and an optional action at the end. The tone shows in the icon and should
 * also show in the words, never in colour alone. It sets no role: pass `role="note"` for static
 * guidance, `role="status"` for a result announced politely, `role="alert"` for an error that must
 * interrupt.
 *
 *   <Callout tone="warning" role="note" title="MCP clients need HTTPS">…</Callout>
 */

export type CalloutTone = 'info' | 'success' | 'warning' | 'error';

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CalloutTone;
  title?: ReactNode;
  /** A small control at the end, e.g. a secondary `Button size="small"`. */
  action?: ReactNode;
  /** Replaces the tone's icon (a Remix Icon component reference). */
  icon?: IconComponent;
  ref?: Ref<HTMLDivElement>;
}

const ICONS: Record<CalloutTone, IconComponent> = {
  info: RiInformationFill,
  success: RiCheckboxCircleFill,
  warning: RiAlertFill,
  error: RiErrorWarningFill,
};

const styles = sortCx({
  root: 'flex items-start gap-3 rounded-2xl bg-background-secondary-default p-3',
  disc: 'flex size-8 shrink-0 items-center justify-center rounded-full',
  tone: {
    info: 'bg-notification-information-background text-notification-information-foreground',
    success: 'bg-notification-success-background text-notification-success-foreground',
    warning: 'bg-status-yellow-background text-status-yellow-text',
    error: 'bg-notification-error-background text-notification-error-foreground',
  },
  // Centres a single line of text on the 32px disc.
  content: 'flex min-w-0 flex-1 flex-col gap-0.5 py-1.5',
  title: 'text-body-medium text-text-primary',
  message: 'text-body-regular text-text-secondary',
  action: 'shrink-0 self-center',
});

export function Callout({
  tone = 'info',
  title,
  action,
  icon,
  className,
  children,
  ref,
  ...props
}: CalloutProps) {
  const Icon = icon ?? ICONS[tone];
  return (
    <div ref={ref} data-tone={tone} className={cx(styles.root, className)} {...props}>
      <span className={cx(styles.disc, styles.tone[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className={styles.content}>
        {title && <p className={styles.title}>{title}</p>}
        {children !== undefined && children !== null && (
          <div className={styles.message}>{children}</div>
        )}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
