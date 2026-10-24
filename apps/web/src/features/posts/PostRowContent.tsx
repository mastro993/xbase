import { cx } from '@xbase/ui/utils/cx';
import { Fragment, type ReactNode } from 'react';
import { ROW_TEXT } from '@/features/shell/row-link';
import { firstLine } from './post-text';

type PostRowContentProps = {
  parts: readonly string[];
  /** Short facts under the first line, joined by dots; falsy ones are left out. */
  meta: ReactNode[];
};

/**
 * A ROW_LINK's text: the post's first line over its facts (time, thread length, state). A fact with
 * its own colour also takes ROW_TEXT.
 */
export function PostRowContent({ parts, meta }: PostRowContentProps) {
  const line = firstLine(parts);
  const facts = meta.filter(Boolean);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={cx('truncate text-body-medium text-text-primary', ROW_TEXT)}>
        {line || <span className={cx('text-text-tertiary', ROW_TEXT)}>Empty post</span>}
      </span>
      {facts.length > 0 && (
        <span className={cx('text-caption-1-medium text-text-secondary', ROW_TEXT)}>
          {facts.map((fact, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a short fixed list, never reordered
            <Fragment key={index}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              {fact}
            </Fragment>
          ))}
        </span>
      )}
    </span>
  );
}
