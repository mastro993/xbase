import { cx } from '@xbase/ui/utils/cx';

/** XBase's mark, decorative: there is no logo asset, so the initials on the accent fill. */
export function AppMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-accent-500 to-accent-600 text-caption-1-semibold text-text-white select-none',
        className,
      )}
    >
      XB
    </span>
  );
}
