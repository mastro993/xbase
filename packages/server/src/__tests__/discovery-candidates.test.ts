import { describe, expect, it } from 'vitest';
import { candidatesFromPage } from '../discovery/candidates';
import type { XPage, XPost, XUser } from '../x-api-client';

// The mapping is pure: a page the read layer returned goes in, the rows a run stores come out.
// Every test fixes the clock, so the age cutoff is the same on every machine.

const NOW = new Date('2026-10-27T15:00:00.000Z');
/** The run's age cap: a day, the default. */
const SINCE = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

type PostInput = {
  id: string;
  authorId?: string;
  createdAt?: string;
  text?: string;
  quoted?: { id: string; authorId: string; authorUsername: string; text: string };
  references?: { type: string; id: string }[];
  metrics?: Record<string, number>;
  extras?: Record<string, unknown>;
};

const user = (id: string, handle: string, followers = 1_500): XUser => ({
  id,
  username: handle,
  name: handle.replace(/_/g, ' '),
  profileImageUrl: null,
  metrics: { followers_count: followers },
});

function postOf({
  id,
  authorId = 'a1',
  createdAt = NOW.toISOString(),
  text = `Post ${id}`,
  quoted,
  references = [],
  metrics = {
    impression_count: 900,
    like_count: 12,
    reply_count: 3,
    retweet_count: 4,
    quote_count: 1,
  },
  extras,
}: PostInput): XPost {
  const raw = {
    id,
    text,
    author_id: authorId,
    created_at: createdAt,
    public_metrics: metrics,
    ...(quoted ? { referenced_tweets: [{ type: 'quoted', id: quoted.id }, ...references] } : {}),
    ...(references.length > 0 && !quoted ? { referenced_tweets: references } : {}),
    ...extras,
  };
  return {
    id,
    authorId,
    authorUsername: 'author',
    text,
    createdAt,
    metrics,
    quotedPost: quoted
      ? {
          id: quoted.id,
          authorId: quoted.authorId,
          authorUsername: quoted.authorUsername,
          text: quoted.text,
        }
      : null,
    fetchedAt: NOW.toISOString(),
    data: raw,
  };
}

const page = (posts: XPost[], users: XUser[] = [user('a1', 'author')]): XPage => ({
  posts,
  users,
});

const options = (overrides: Partial<Parameters<typeof candidatesFromPage>[1]> = {}) => ({
  source: 'search' as const,
  savedSearchId: 's1',
  following: null,
  since: SINCE,
  ...overrides,
});

describe('candidates', () => {
  it('keeps an original post with its body, author, link and engagement', () => {
    const row = candidatesFromPage(
      page([
        postOf({
          id: '1',
          text: 'A post with a long body.\nIt has two lines.',
          extras: { lang: 'en', conversation_id: 'c1', attachments: { media_keys: ['m1'] } },
        }),
      ]),
      options({ following: new Set(['a1']) }),
    );

    expect(row.dropped).toEqual([]);
    expect(row.candidates).toHaveLength(1);
    expect(row.candidates[0]).toMatchObject({
      xPostId: '1',
      source: 'search',
      savedSearchId: 's1',
      url: 'https://x.com/author/status/1',
      authorId: 'a1',
      authorHandle: 'author',
      authorName: 'author',
      authorFollowers: 1_500,
      authorFollowing: true,
      text: 'A post with a long body.\nIt has two lines.',
      lang: 'en',
      postedAt: NOW,
      views: 900,
      likes: 12,
      replies: 3,
      reposts: 4,
      quotes: 1,
      hasMedia: true,
      isQuote: false,
      conversationId: 'c1',
      quotedPostId: null,
      quotedText: null,
    });
  });

  it('marks an unknown follow list as null rather than guessing', () => {
    const { candidates } = candidatesFromPage(page([postOf({ id: '1' })]), options());
    expect(candidates[0]?.authorFollowing).toBeNull();
  });

  it('marks an author outside the follow list as not followed', () => {
    const { candidates } = candidatesFromPage(
      page([postOf({ id: '1' })]),
      options({ following: new Set(['someone-else']) }),
    );
    expect(candidates[0]?.authorFollowing).toBe(false);
  });

  it('keeps a post exactly at the age cutoff and drops the one a second older', () => {
    const boundary = SINCE.toISOString();
    const older = new Date(SINCE.getTime() - 1_000).toISOString();
    const { candidates, dropped } = candidatesFromPage(
      page([
        postOf({ id: 'boundary', createdAt: boundary }),
        postOf({ id: 'older', createdAt: older }),
      ]),
      options(),
    );
    expect(candidates.map(({ xPostId }) => xPostId)).toEqual(['boundary']);
    expect(dropped).toEqual([{ xPostId: 'older', reason: 'too_old' }]);
  });

  it('drops replies and plain reposts, and says which was which', () => {
    const { candidates, dropped } = candidatesFromPage(
      page([
        postOf({ id: 'reply', references: [{ type: 'replied_to', id: '9' }] }),
        postOf({ id: 'repost', references: [{ type: 'retweeted', id: '8' }] }),
        postOf({ id: 'original' }),
      ]),
      options(),
    );
    expect(candidates.map(({ xPostId }) => xPostId)).toEqual(['original']);
    expect(dropped).toEqual([
      { xPostId: 'reply', reason: 'reply' },
      { xPostId: 'repost', reason: 'repost' },
    ]);
  });

  it('stores the quoted post’s text and author beside the candidate', () => {
    const { candidates } = candidatesFromPage(
      page(
        [
          postOf({
            id: '1',
            text: 'Look at this.',
            quoted: {
              id: '9',
              authorId: 'a9',
              authorUsername: 'quoted',
              text: 'The quoted post, in full.',
            },
          }),
        ],
        [user('a1', 'author'), user('a9', 'quoted')],
      ),
      options(),
    );
    expect(candidates[0]).toMatchObject({
      text: 'Look at this.',
      isQuote: true,
      quotedPostId: '9',
      quotedText: 'The quoted post, in full.',
      quotedAuthorId: 'a9',
      quotedAuthorHandle: 'quoted',
    });
  });

  it('drops a quote X could not return in full, and one whose text is blank', () => {
    const missingQuote = postOf({ id: '1' });
    missingQuote.data = { referenced_tweets: [{ type: 'quoted', id: '9' }] };
    const blankQuote = postOf({
      id: '2',
      quoted: { id: '9', authorId: 'a9', authorUsername: 'quoted', text: '   ' },
    });
    const { candidates, dropped } = candidatesFromPage(
      page([missingQuote, blankQuote], [user('a1', 'author'), user('a9', 'quoted')]),
      options(),
    );
    expect(candidates).toEqual([]);
    expect(dropped).toEqual([
      { xPostId: '1', reason: 'quote_missing' },
      { xPostId: '2', reason: 'quote_missing' },
    ]);
  });

  it('drops a post with no date, no body or no author, naming each reason', () => {
    const { candidates, dropped } = candidatesFromPage(
      page([
        postOf({ id: 'undated', createdAt: 'not a date' }),
        postOf({ id: 'empty', text: '  \n ' }),
        { ...postOf({ id: 'orphan' }), authorId: 'gone' },
      ]),
      options(),
    );
    expect(candidates).toEqual([]);
    expect(dropped).toEqual([
      { xPostId: 'undated', reason: 'undated' },
      { xPostId: 'empty', reason: 'empty_text' },
      { xPostId: 'orphan', reason: 'author_missing' },
    ]);
  });
});
