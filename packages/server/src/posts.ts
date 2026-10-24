import { InvalidStateError, NotFoundError, ValidationError } from '@xbase/core/errors';
import {
  DraftParts,
  hasText,
  MAX_LIST_LIMIT,
  MIN_PUBLISH_LEAD_MS,
  type PostDto,
  type PostOrigin,
  type PostStatus,
} from '@xbase/core/posts/schema';
import { parseInput } from '@xbase/core/validate';
import { getDb } from '@xbase/db/client';
import { type Post, posts, xAccounts } from '@xbase/db/schema';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';

// Each account's posts: draft → scheduled → publishing → published (or failed). The UI, the REST
// API and the MCP tools all go through here. Lists cover one account, or every account without
// one; a post id stands on its own. Statements run synchronously on one connection, so a check and
// the write after it can't interleave with another request.

const DEFAULT_LIST_LIMIT = 50;

const iso = (date: Date | null) => date?.toISOString() ?? null;

type Row = { post: Post; account: string };

/** Posts with their account's username. */
const rows = () =>
  getDb()
    .select({ post: posts, account: xAccounts.username })
    .from(posts)
    .innerJoin(xAccounts, eq(posts.accountId, xAccounts.id));

function toDto({ post, account }: Row): PostDto {
  return {
    id: post.id,
    account,
    status: post.status,
    parts: post.parts.map(({ text }) => text),
    publishAt: iso(post.publishAt),
    publishedAt: iso(post.publishedAt),
    xPostId: post.xPostId,
    error: post.error,
    origin: post.origin,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function findRow(id: string): Row {
  const row = rows().where(eq(posts.id, id)).get();
  if (!row) throw new NotFoundError('Post not found.');
  return row;
}

const find = (id: string): Post => findRow(id).post;

/** Posts on their way to X, or already there, are frozen. */
function assertChangeable({ status }: Post): void {
  if (status === 'publishing') {
    throw new InvalidStateError("This post is being published right now, so it can't be changed.");
  }
  if (status === 'published') {
    throw new InvalidStateError("This post is already on X, so it can't be changed.");
  }
}

/** X rejects empty posts, so nothing with an empty part may be scheduled. */
function assertPublishable(parts: readonly string[]): void {
  const empty = parts.findIndex((text) => !hasText(text));
  if (empty === -1) return;
  throw new ValidationError(
    parts.length === 1 ? 'Write something first.' : `Post ${empty + 1} of the thread is empty.`,
  );
}

function save(id: string, values: Partial<typeof posts.$inferInsert>): PostDto {
  getDb().update(posts).set(values).where(eq(posts.id, id)).run();
  return toDto(findRow(id));
}

const toParts = (texts: readonly string[]) => texts.map((text) => ({ text }));

/** Drafts and failed posts, last edited first; every account's without `accountId`. */
export function listDrafts({
  accountId,
  limit = DEFAULT_LIST_LIMIT,
}: { accountId?: string; limit?: number } = {}): PostDto[] {
  return rows()
    .where(
      and(
        accountId ? eq(posts.accountId, accountId) : undefined,
        inArray(posts.status, ['draft', 'failed'] satisfies PostStatus[]),
      ),
    )
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt))
    .limit(Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT))
    .all()
    .map(toDto);
}

/** The queue: posts with a publish time in [from, to), soonest first. */
export function listScheduled({
  accountId,
  from,
  to,
}: { accountId?: string; from?: Date; to?: Date } = {}): PostDto[] {
  return rows()
    .where(
      and(
        accountId ? eq(posts.accountId, accountId) : undefined,
        inArray(posts.status, ['scheduled', 'publishing', 'failed'] satisfies PostStatus[]),
        isNotNull(posts.publishAt),
        from && gte(posts.publishAt, from),
        to && lt(posts.publishAt, to),
      ),
    )
    .orderBy(asc(posts.publishAt), asc(posts.createdAt))
    .all()
    .map(toDto);
}

/** Throws NotFoundError. */
export function getPost(id: string): PostDto {
  return toDto(findRow(id));
}

/** Parts may be empty while writing; callers that need text check it first. */
export function createDraft({
  accountId,
  parts,
  origin,
}: {
  accountId: string;
  parts: string[];
  origin: PostOrigin;
}): PostDto {
  const texts = parseInput(DraftParts, parts);
  const { id } = getDb()
    .insert(posts)
    .values({ accountId, parts: toParts(texts), origin })
    .returning({ id: posts.id })
    .get();
  return getPost(id);
}

/** Replaces the texts of a draft, scheduled or failed post. A scheduled post keeps its time. */
export function updateDraft(id: string, { parts }: { parts: string[] }): PostDto {
  const texts = parseInput(DraftParts, parts);
  const post = find(id);
  assertChangeable(post);
  if (post.status === 'scheduled') assertPublishable(texts);
  return save(id, { parts: toParts(texts) });
}

export function deletePost(id: string): void {
  assertChangeable(find(id));
  getDb().delete(posts).where(eq(posts.id, id)).run();
}

/** Queues a post, or moves it, at least a minute ahead. Also retries a failed post. */
export function schedulePost(id: string, publishAt: Date): PostDto {
  const post = find(id);
  assertChangeable(post);
  if (!(publishAt.getTime() >= Date.now() + MIN_PUBLISH_LEAD_MS)) {
    throw new ValidationError('Pick a time at least a minute from now.');
  }
  assertPublishable(post.parts.map(({ text }) => text));
  return save(id, { status: 'scheduled', publishAt, error: null });
}

/** Takes a post out of the queue, back to the drafts. A draft is left as it is. */
export function unschedulePost(id: string): PostDto {
  const row = findRow(id);
  assertChangeable(row.post);
  if (row.post.status === 'draft') return toDto(row);
  return save(id, { status: 'draft', publishAt: null, error: null });
}
