import {
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
} from '@hugeicons/core-free-icons';

/** Navigation glyphs mirror; logos, media controls and trend arrows do not. */
const directionalIcons: ReadonlySet<unknown> = new Set([
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
]);

export function directionalIconClass(icon: unknown): string | undefined {
  return directionalIcons.has(icon) ? 'rtl:rotate-180' : undefined;
}
