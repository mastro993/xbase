import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cx, sortCx } from '@xbase/ui/utils/cx';
import type { ButtonHTMLAttributes, Ref } from 'react';

/**
 * Compact circular dismiss control — the "X" used to close announcements,
 * toasts, modals, and drawers. Companion to `IconButton`, but ships its own
 * glyph (rather than taking an `icon` prop) so every consumer gets an
 * identical X with a stroke that's a true CSS pixel value per size, not a
 * scaled approximation.
 *
 * The glyph is Hugeicons' `Cancel01Icon`; `absoluteStrokeWidth` keeps its
 * stroke a literal CSS pixel value at every size, instead of scaling with the
 * icon.
 *
 * Sizes (px). `Cancel01Icon` draws its X across the middle half of the 24px
 * box, so the box is twice the X span it replaces:
 *   2xs = 16 container, 11.3px box (5.7px X), 1.6px stroke   (compact floating surfaces)
 *   xs = 20 container, 13.6px box (6.8px X), 2px stroke      (Announcement dismiss corner)
 *   sm = 24 container, 17.2px box (8.6px X), 2px stroke
 *   md = 32 container, 24.4px box (12.2px X), 2.5px stroke   (modal header close — a touch
 *                                                             bolder to hold its own at
 *                                                             the larger size)
 */

type CloseButtonSize = '2xs' | 'xs' | 'sm' | 'md';

export interface CloseButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  size?: CloseButtonSize;
  /** Accessible name — required since there is no visible label. */
  'aria-label': string;
  ref?: Ref<HTMLButtonElement>;
}

const GLYPH_SIZE: Record<CloseButtonSize, number> = {
  '2xs': 11.3,
  xs: 13.6,
  sm: 17.2,
  md: 24.4,
};

const STROKE_WIDTH: Record<CloseButtonSize, number> = {
  '2xs': 1.6,
  xs: 2,
  sm: 2,
  md: 2.5,
};

const styles = sortCx({
  base: [
    'inline-flex shrink-0 items-center justify-center rounded-full',
    'bg-background-tertiary-default text-foreground-icon-secondary',
    'select-none cursor-pointer',
    'transition-colors duration-150 ease',
    'hover:text-text-primary',
    'outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring',
  ].join(' '),
  container: {
    '2xs': 'size-4',
    xs: 'size-5',
    sm: 'size-6',
    md: 'size-8',
  },
});

export function CloseButton({
  size = 'xs',
  className,
  type = 'button',
  ref,
  ...props
}: CloseButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.base, styles.container[size], className)}
      {...props}
    >
      <HugeiconsIcon
        icon={Cancel01Icon}
        size={GLYPH_SIZE[size]}
        strokeWidth={STROKE_WIDTH[size]}
        absoluteStrokeWidth
        aria-hidden
      />
    </button>
  );
}
