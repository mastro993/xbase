import { cx } from '@xbase/ui/utils/cx';
import type { SVGProps } from 'react';

/**
 * Why it exists: BoardUI's Button has no loading state and composer-loader only rings a chat
 * composer, so nothing in the free registry shows "busy".
 *
 * A spinning ring in the current text colour, always decorative (hidden from screen readers):
 * the state comes from the busy button it sits in, or from the visible text beside it.
 *
 *   <Button leadingIcon={saving ? Spinner : undefined} aria-busy={saving || undefined}>
 *     Save
 *   </Button>
 *
 * It stops spinning under reduced motion.
 */

export type SpinnerProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cx('size-5 shrink-0 animate-spin motion-reduce:animate-none', className)}
      {...props}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
