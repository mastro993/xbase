/** The rows' container in a list pane: a column with BoardUI's row spacing. */
export const ROW_LIST = 'flex flex-col gap-0.5 p-2';

/**
 * A list pane's row, on a TanStack Link: BoardUI's sidebar row, a step darker on hover. The open
 * item (the Link's aria-current="page") takes the sidebar's selected look: an accent fill whose
 * accent-500 edge stands out from the tray at 3:1 or more (palettes/__tests__/contrast.test.ts),
 * and far more than a hovered row. Give each coloured text inside the row ROW_TEXT, so it turns
 * white on the fill. The focus ring sits 2px off the row, so it doesn't merge into that fill.
 */
export const ROW_LINK =
  'group flex w-full items-center gap-3 rounded-2lg px-3 py-2.5 text-start outline-none transition-colors duration-150 ease-out not-aria-[current=page]:hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2 aria-[current=page]:bg-linear-to-b aria-[current=page]:from-accent-500 aria-[current=page]:to-accent-600 aria-[current=page]:shadow-nav-selected';

/** A coloured text inside a ROW_LINK: white while the row is the open item. */
export const ROW_TEXT = 'group-aria-[current=page]:text-text-white';
