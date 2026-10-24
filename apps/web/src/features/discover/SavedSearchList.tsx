import { Link } from '@tanstack/react-router';
import { cx } from '@xbase/ui/utils/cx';
import { ROW_LINK, ROW_LIST, ROW_TEXT } from '@/features/shell/row-link';
import type { SavedSearchDto } from './discover.schema';

/** The Discover list pane: saved searches, by name. */
export function SavedSearchList({ searches }: { searches: SavedSearchDto[] }) {
  if (searches.length === 0) {
    return (
      <p className="p-4 text-body-regular text-text-secondary">
        No saved searches yet. Save the X searches you’d run to find posts to reply to.
      </p>
    );
  }
  return (
    <ul className={ROW_LIST}>
      {searches.map((search) => (
        <li key={search.id}>
          <Link to="/discover/$searchId" params={{ searchId: search.id }} className={ROW_LINK}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cx('truncate text-body-medium text-text-primary', ROW_TEXT)}>
                {search.name}
              </span>
              <span
                className={cx(
                  'truncate font-mono text-caption-1-medium text-text-secondary',
                  ROW_TEXT,
                )}
              >
                {search.query}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
