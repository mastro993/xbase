import { Tick02Icon } from '@hugeicons/core-free-icons';
import { IconGlyph } from '@xbase/ui/utils/icon';

/** A card's "Saved" note after a save, until the next edit; always mounted, so it's announced. */
export function SavedStatus({ saved }: { saved: boolean }) {
  return (
    <span role="status" className="flex items-center gap-1 text-body-regular text-text-secondary">
      {saved && (
        <>
          <IconGlyph icon={Tick02Icon} aria-hidden className="size-4 text-status-lime-text" />
          Saved
        </>
      )}
    </span>
  );
}
