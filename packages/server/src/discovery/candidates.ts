import type { CandidateSource } from '@xbase/core/discover';
import { z } from 'zod';
import type { XPage, XPost } from '../x-api-client';

// Turns one page the read layer returned into candidate rows: the posts a reply could go to,
// with their full body and the post they quote. Pure, so the rules that decide what to keep are
// tested without the network or a database. Runs pay for what X returns; this drops what a run
// would never keep, which is why the API filters in x-api-client.ts are only a first pass.

/**
 * Why a post X returned was not stored; a run logs these, one line each (see #16). The filters'
 * reasons are separate: a post they exclude is stored, with its reason, in case a setting changes.
 */
export type DropReason =
  | 'too_old'
  | 'undated'
  | 'reply'
  | 'repost'
  | 'author_missing'
  | 'empty_text'
  | 'quote_missing'
  /** Already shown, skipped or replied to: never suggested again (see memory.ts). */
  | 'remembered';

export type DroppedPost = { xPostId: string; reason: DropReason };

/** One candidate as the database stores it, without its account or row id. */
export type CandidateRow = {
  xPostId: string;
  source: CandidateSource;
  savedSearchId: string | null;
  url: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  authorFollowers: number | null;
  authorFollowing: boolean | null;
  text: string;
  lang: string | null;
  postedAt: Date;
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  hasMedia: boolean;
  isQuote: boolean;
  conversationId: string | null;
  quotedPostId: string | null;
  quotedText: string | null;
  quotedAuthorId: string | null;
  quotedAuthorHandle: string | null;
  fetchedAt: Date;
};

/** The tweet as X sent it, for the fields the read layer doesn't lift into its own type. */
const TweetExtras = z.looseObject({
  lang: z.string().optional(),
  conversation_id: z.string().optional(),
  attachments: z.looseObject({ media_keys: z.array(z.string()).optional() }).optional(),
  referenced_tweets: z.array(z.looseObject({ type: z.string(), id: z.string() })).optional(),
});

const extrasOf = (post: XPost): z.infer<typeof TweetExtras> => {
  // The read layer already accepted the page; a missing field is a post X sent without it.
  const parsed = TweetExtras.safeParse(post.data);
  return parsed.success ? parsed.data : {};
};

const metric = (post: XPost, name: string): number | null => post.metrics?.[name] ?? null;

/** A post's home on x.com: the handle makes the link readable as well as resolvable. */
const postUrl = (handle: string, id: string): string => `https://x.com/${handle}/status/${id}`;

/** The trimmed body, or null when X sent nothing readable: an empty candidate can't be replied to. */
const bodyOf = (text: string): string | null => {
  const body = text.trim();
  return body.length > 0 ? body : null;
};

type PageOptions = {
  source: CandidateSource;
  /** The saved search the page answers; null for the home timeline. */
  savedSearchId?: string | null;
  /** The accounts the user follows, or null when the follow list can't be read. */
  following: Set<string> | null;
  /** The oldest post a run keeps: the account's hard age cap before the run started. */
  since: Date;
};

type PageResult = { candidates: CandidateRow[]; dropped: DroppedPost[] };

/**
 * The candidates in one page, in the order X returned them, plus the posts dropped and why. The
 * API already excludes replies and retweets and asks only for the last day; this repeats both
 * checks because a cached or a misreported page must never leak an old reply through.
 */
export function candidatesFromPage(page: XPage, options: PageOptions): PageResult {
  const users = new Map(page.users.map((user) => [user.id, user]));
  const cutoff = options.since.getTime();
  const candidates: CandidateRow[] = [];
  const dropped: DroppedPost[] = [];

  for (const post of page.posts) {
    const drop = (reason: DropReason) => dropped.push({ xPostId: post.id, reason });
    const extras = extrasOf(post);
    const references = extras.referenced_tweets ?? [];

    if (references.some(({ type }) => type === 'retweeted')) {
      drop('repost');
      continue;
    }
    if (references.some(({ type }) => type === 'replied_to')) {
      drop('reply');
      continue;
    }

    const created = post.createdAt === null ? null : new Date(post.createdAt);
    if (!created || Number.isNaN(created.getTime())) {
      drop('undated');
      continue;
    }
    if (created.getTime() < cutoff) {
      drop('too_old');
      continue;
    }

    const text = bodyOf(post.text);
    if (!text) {
      drop('empty_text');
      continue;
    }

    const author = users.get(post.authorId);
    if (!author) {
      drop('author_missing');
      continue;
    }

    const quoted = post.quotedPost;
    const quotes = references.some(({ type }) => type === 'quoted') || quoted !== null;
    const quotedText = quoted ? bodyOf(quoted.text) : null;
    // A quote whose post X couldn't return (deleted or protected) can't be read in full: drop it
    // rather than suggest a reply to a post whose other half is a guess.
    if (quotes && (!quoted || !quotedText)) {
      drop('quote_missing');
      continue;
    }

    candidates.push({
      xPostId: post.id,
      source: options.source,
      savedSearchId: options.savedSearchId ?? null,
      url: postUrl(author.username, post.id),
      authorId: author.id,
      authorHandle: author.username,
      authorName: author.name,
      authorFollowers: author.metrics?.followers_count ?? null,
      authorFollowing: options.following === null ? null : options.following.has(author.id),
      text,
      lang: extras.lang ?? null,
      postedAt: created,
      views: metric(post, 'impression_count'),
      likes: metric(post, 'like_count'),
      replies: metric(post, 'reply_count'),
      reposts: metric(post, 'retweet_count'),
      quotes: metric(post, 'quote_count'),
      hasMedia: (extras.attachments?.media_keys?.length ?? 0) > 0,
      isQuote: quotes,
      conversationId: extras.conversation_id ?? null,
      quotedPostId: quoted?.id ?? null,
      quotedText: quotedText,
      quotedAuthorId: quoted?.authorId || null,
      quotedAuthorHandle: quoted?.authorUsername ?? null,
      fetchedAt: new Date(post.fetchedAt),
    });
  }

  return { candidates, dropped };
}
