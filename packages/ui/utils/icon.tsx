import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import type { ComponentType } from 'react';

/** What BoardUI passes to an icon: it owns the size and hides the glyph from screen readers. */
export interface IconProps {
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

/**
 * BoardUI's icon props take a reference, not an element. Hugeicons ships icon data
 * (`Add01Icon`, from `@hugeicons/core-free-icons`), which this renders; a component such as
 * `Spinner` still works, so a busy button can keep its loading state.
 */
export type IconReference = IconSvgElement | ComponentType<IconProps>;

function isIconSvgElement(icon: IconReference): icon is IconSvgElement {
  return Array.isArray(icon);
}

export function IconGlyph({ icon, ...props }: IconProps & { icon: IconReference }) {
  if (isIconSvgElement(icon)) return <HugeiconsIcon icon={icon} {...props} />;

  const Icon = icon;
  return <Icon {...props} />;
}
