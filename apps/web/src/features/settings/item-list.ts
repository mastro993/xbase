// A list inside a settings card (API keys, connected apps): the card's border recipe one radius
// step down, rows split by the same border colour (the separator hairline vanishes in dark mode).

/** The `<ul>`. */
export const ITEM_LIST =
  'flex flex-col divide-y divide-border-button-default rounded-2xl border border-border-button-default';

/** An `<li>`: the details at the start, the row's action at the end; the action wraps below. */
export const ITEM_ROW = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3';

/** The details column: a name, then a line of metadata. */
export const ITEM_DETAILS = 'flex min-w-0 flex-1 basis-56 flex-col gap-0.5';

export const ITEM_NAME = 'text-body-medium break-words text-text-primary';

/** Wraps instead of truncating: the dates matter more than one tidy line. */
export const ITEM_META =
  'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-2-regular text-text-secondary';
