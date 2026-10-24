// Focus that would otherwise drop to <body> and leave keyboard and screen-reader users lost.

/**
 * Focus dropped to <body> because the control that had it unmounted (e.g. Unschedule, once the post
 * is a draft): move it to `target` once the work is done.
 */
export function refocus(target: HTMLElement | null): void {
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) target?.focus();
  });
}

/**
 * Moves focus to the page's h1 (SplitView's, marked data-page-heading) after what it was on is
 * gone, e.g. a deleted draft's composer. Looked up when it runs: the component that asked has
 * usually unmounted by then.
 */
export function focusPageHeading(): void {
  requestAnimationFrame(() => {
    if (document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>('[data-page-heading]')?.focus();
  });
}
