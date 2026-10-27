import { RiCheckLine } from '@remixicon/react';

/** A card's "Saved" note after a save, until the next edit; always mounted, so it's announced. */
export function SavedStatus({ saved }: { saved: boolean }) {
  return (
    <span role="status" className="flex items-center gap-1 text-body-regular text-text-secondary">
      {saved && (
        <>
          <RiCheckLine aria-hidden className="size-4 text-status-lime-text" />
          Saved
        </>
      )}
    </span>
  );
}
