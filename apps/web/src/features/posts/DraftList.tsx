import { Link } from '@tanstack/react-router';
import { cx } from '@xbase/ui/utils/cx';
import { ROW_LINK, ROW_LIST, ROW_TEXT } from '@/features/shell/row-link';
import { LocalTime } from './LocalTime';
import { threadLabel } from './post-text';
import { PostRowContent } from './PostRowContent';
import { MAX_LIST_LIMIT, type PostDto } from './posts.schema';

/** The Drafts list pane: drafts and failed posts, last edited first. */
export function DraftList({ drafts }: { drafts: PostDto[] }) {
  if (drafts.length === 0) {
    return (
      <p className="p-4 text-body-regular text-text-secondary">
        No drafts yet. Start one here, or create them through the API or MCP.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      <ul className={ROW_LIST}>
        {drafts.map((post) => (
          <li key={post.id}>
            <Link to="/drafts/$draftId" params={{ draftId: post.id }} className={ROW_LINK}>
              <PostRowContent
                parts={post.parts}
                meta={[
                  <LocalTime key="time" value={post.updatedAt} format="stamp" />,
                  threadLabel(post.parts),
                  post.status === 'failed' && (
                    <span
                      key="failed"
                      className={cx('text-caption-1-semibold text-text-error-primary', ROW_TEXT)}
                    >
                      Failed to publish
                    </span>
                  ),
                ]}
              />
            </Link>
          </li>
        ))}
      </ul>
      {drafts.length >= MAX_LIST_LIMIT && (
        <p className="px-5 pb-4 text-caption-1-medium text-text-tertiary">
          Showing the {MAX_LIST_LIMIT} drafts edited last.
        </p>
      )}
    </div>
  );
}
