import { Link } from '@tanstack/react-router';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { cx } from '@xbase/ui/utils/cx';
import { useId } from 'react';
import { ROW_LINK, ROW_TEXT } from '@/features/shell/row-link';
import { formatTime, groupByDay } from './dates';
import { threadLabel } from './post-text';
import { PostRowContent } from './PostRowContent';
import type { PostDto } from './posts.schema';
import { useClock } from './use-clock';

/** The Queue list pane: scheduled and failed posts, soonest first, under their local day. */
export function QueueList({ posts }: { posts: PostDto[] }) {
  const clock = useClock();
  const headingId = useId();
  const groups = groupByDay(posts, clock);

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* At lg the pane is the tray, so the note takes the card surface to stand out from it. */}
      <Callout
        tone="warning"
        role="note"
        title="Publishing isn’t connected yet"
        className="lg:bg-background-primary-default"
      >
        XBase can’t post to X until the X API is connected, so scheduled posts won’t be sent.
      </Callout>
      {groups.length === 0 ? (
        <p className="px-3 py-2 text-body-regular text-text-secondary">
          Nothing scheduled. Schedule a draft from Drafts, or through MCP.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`${headingId}-${group.key}`}>
            <h2
              id={`${headingId}-${group.key}`}
              className="px-3 pt-3 pb-1 text-caption-1-semibold text-text-tertiary"
            >
              {group.label}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {group.posts.map((post) => {
                const date = new Date(post.publishAt ?? post.updatedAt);
                const missed =
                  post.status === 'scheduled' &&
                  clock.now !== undefined &&
                  date.getTime() < clock.now.getTime();
                return (
                  <li key={post.id}>
                    <Link to="/queue/$postId" params={{ postId: post.id }} className={ROW_LINK}>
                      <time
                        dateTime={post.publishAt ?? undefined}
                        className={cx(
                          'w-18 shrink-0 text-body-medium text-text-primary tabular-nums',
                          ROW_TEXT,
                        )}
                      >
                        {formatTime(date, clock)}
                      </time>
                      <PostRowContent
                        parts={post.parts}
                        meta={[
                          post.status === 'failed' && (
                            <span
                              key="failed"
                              className={cx(
                                'text-caption-1-semibold text-text-error-primary',
                                ROW_TEXT,
                              )}
                            >
                              Failed to publish
                            </span>
                          ),
                          post.status === 'publishing' && <span key="publishing">Publishing</span>,
                          missed && <span key="missed">Time passed, not sent</span>,
                          threadLabel(post.parts),
                        ]}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
